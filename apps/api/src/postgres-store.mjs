export class PostgresStore {
  constructor(pool) { this.pool = pool; }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = new PostgresTransaction(client);
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async commandStatus(businessId, commandId) {
    const {rows} = await this.pool.query(
      'SELECT outcome FROM api_commands WHERE business_id = $1 AND command_id = $2',
      [businessId, commandId],
    );
    return rows[0]?.outcome ?? null;
  }

  async changesAfter(businessId, after, limit) {
    const {rows: highWaterRows} = await this.pool.query(
      'SELECT cursor FROM business_change_cursors WHERE business_id = $1', [businessId],
    );
    const highWater = Number(highWaterRows[0]?.cursor ?? 0);
    const {rows} = await this.pool.query(`
      SELECT cursor, command_id AS "commandId", change_type AS "changeType", projection, occurred_at AS "occurredAt"
      FROM business_changes
      WHERE business_id = $1 AND cursor > $2
      ORDER BY cursor
      LIMIT $3
    `, [businessId, after, limit + 1]);
    const hasMore = rows.length > limit;
    const changes = rows.slice(0, limit).map(row => ({...row, cursor: Number(row.cursor)}));
    return {fromCursor: after, toCursor: changes.at(-1)?.cursor ?? after, highWater, hasMore, changes};
  }

  async listCatalogItems(businessId, search = '') {
    const {rows} = await this.pool.query(`
      SELECT id, category_id AS "categoryId", name, sku, base_price_minor AS "basePriceMinor",
             currency, track_inventory AS "trackInventory", version, created_at AS "createdAt"
      FROM catalog_items
      WHERE business_id = $1 AND archived_at IS NULL
        AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%')
      ORDER BY name, id
      LIMIT 500
    `, [businessId, search]);
    return rows;
  }

  async authenticateSession(tokenHash, deviceId, now = new Date()) {
    const {rows} = await this.pool.query(`
      SELECT s.business_id AS "businessId", s.staff_id AS "staffId", d.id AS "deviceId",
             COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
      FROM api_staff_sessions s
      JOIN api_enrolled_devices d ON d.business_id = s.business_id AND d.staff_id = s.staff_id AND d.id = $2
      LEFT JOIN api_staff_permissions p ON p.business_id = s.business_id AND p.staff_id = s.staff_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $3
        AND d.revoked_at IS NULL
      GROUP BY s.business_id, s.staff_id, d.id
    `, [tokenHash, deviceId, now]);
    return rows[0] ?? null;
  }

  async authenticateStaffSession(tokenHash, now = new Date()) {
    const {rows} = await this.pool.query(`
      SELECT s.business_id AS "businessId", s.staff_id AS "staffId",
             COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
      FROM api_staff_sessions s
      LEFT JOIN api_staff_permissions p ON p.business_id = s.business_id AND p.staff_id = s.staff_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2
      GROUP BY s.business_id, s.staff_id
    `, [tokenHash, now]);
    return rows[0] ?? null;
  }

  async issueDeviceEnrollmentChallenge({challengeId, challenge, businessId, staffId, issuedAt, expiresAt}) {
    await this.pool.query(`
      INSERT INTO api_device_enrollment_challenges (id, challenge, business_id, staff_id, issued_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [challengeId, challenge, businessId, staffId, issuedAt, expiresAt]);
    return {challengeId, challenge, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString()};
  }

  async deviceEnrollmentChallenge(challengeId, businessId, staffId) {
    const {rows} = await this.pool.query(`
      SELECT id AS "challengeId", challenge, business_id AS "businessId", staff_id AS "staffId",
             expires_at AS "expiresAt", consumed_at AS "consumedAt"
      FROM api_device_enrollment_challenges
      WHERE id = $1 AND business_id = $2 AND staff_id = $3
    `, [challengeId, businessId, staffId]);
    return rows[0] ?? null;
  }

  async enrollDevice({challengeId, businessId, staffId, deviceId, publicKey, at}) {
    return this.transaction(async tx => {
      const {rows} = await tx.client.query(`
        SELECT challenge, expires_at AS "expiresAt", consumed_at AS "consumedAt"
        FROM api_device_enrollment_challenges
        WHERE id = $1 AND business_id = $2 AND staff_id = $3
        FOR UPDATE
      `, [challengeId, businessId, staffId]);
      const challenge = rows[0];
      if (!challenge || challenge.consumedAt || new Date(challenge.expiresAt) <= at) {
        const error = new Error('Enrollment challenge is expired or already used.');
        error.status = 409;
        error.code = 'ENROLLMENT_CHALLENGE_INVALID';
        throw error;
      }
      await tx.client.query(`
        INSERT INTO api_enrolled_devices (id, business_id, staff_id, public_key, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `, [deviceId, businessId, staffId, JSON.stringify(publicKey), at]);
      await tx.client.query('UPDATE api_device_enrollment_challenges SET consumed_at = $2 WHERE id = $1', [challengeId, at]);
      return {id: deviceId, businessId, staffId, publicKey, createdAt: at.toISOString()};
    });
  }
}

class PostgresTransaction {
  constructor(client) { this.client = client; }

  async getCommand(businessId, commandId) {
    const {rows} = await this.client.query(
      'SELECT payload_hash AS "payloadHash", outcome FROM api_commands WHERE business_id = $1 AND command_id = $2 FOR UPDATE',
      [businessId, commandId],
    );
    return rows[0] ?? null;
  }

  async lockCommandKey(businessId, commandId) {
    await this.client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${businessId}:${commandId}`],
    );
  }

  async assertExpectedVersions(businessId, expectedVersions) {
    for (const [key, expected] of Object.entries(expectedVersions).sort(([a], [b]) => a.localeCompare(b))) {
      const separator = key.indexOf(':');
      if (separator <= 0 || separator === key.length - 1 || !Number.isSafeInteger(expected) || expected < 0) {
        const error = new Error(`Invalid expected version entry: ${key}`);
        error.status = 400;
        error.code = 'VALIDATION_FAILED';
        throw error;
      }
      const entityType = key.slice(0, separator);
      const entityId = key.slice(separator + 1);
      await this.client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`entity:${businessId}:${entityType}:${entityId}`],
      );
      const {rows} = await this.client.query(
        'SELECT version FROM business_entity_versions WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3 FOR UPDATE',
        [businessId, entityType, entityId],
      );
      const actual = rows.length ? Number(rows[0].version) : 0;
      if (actual !== expected) {
        const error = new Error('A resource changed after this workflow was reviewed. Refresh it and try again.');
        error.status = 409;
        error.code = 'VERSION_CONFLICT';
        error.details = {entityType, entityId, expectedVersion: expected, currentVersion: actual};
        throw error;
      }
    }
  }

  async bumpEntityVersion(businessId, entityType, entityId, expectedVersion) {
    await this.client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`entity:${businessId}:${entityType}:${entityId}`],
    );
    const {rows} = await this.client.query(
      'SELECT version FROM business_entity_versions WHERE business_id = $1 AND entity_type = $2 AND entity_id = $3 FOR UPDATE',
      [businessId, entityType, entityId],
    );
    const current = rows.length ? Number(rows[0].version) : 0;
    if (expectedVersion !== undefined && current !== expectedVersion) {
      const error = new Error('A resource changed after this workflow was reviewed. Refresh it and try again.');
      error.status = 409;
      error.code = 'VERSION_CONFLICT';
      error.details = {entityType, entityId, expectedVersion, currentVersion: current};
      throw error;
    }
    const next = current + 1;
    await this.client.query(`
      INSERT INTO business_entity_versions (business_id, entity_type, entity_id, version)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (business_id, entity_type, entity_id) DO UPDATE SET version = EXCLUDED.version
    `, [businessId, entityType, entityId, next]);
    return next;
  }

  async insertCatalogItem(item) {
    await this.client.query(`
      INSERT INTO catalog_items
        (business_id, id, category_id, name, sku, base_price_minor, currency, track_inventory, version, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
    `, [item.businessId, item.id, item.categoryId, item.name, item.sku, item.basePriceMinor, item.currency, item.trackInventory, item.version, item.staffId]);
  }

  async findCatalogSku(businessId, sku) {
    const {rows} = await this.client.query(
      'SELECT id FROM catalog_items WHERE business_id = $1 AND lower(sku) = lower($2) AND archived_at IS NULL',
      [businessId, sku],
    );
    return rows[0] ?? null;
  }

  async requireCatalogCategory(businessId, categoryId) {
    const {rows} = await this.client.query(
      'SELECT 1 FROM catalog_categories WHERE business_id = $1 AND id = $2 AND archived_at IS NULL FOR SHARE',
      [businessId, categoryId],
    );
    return rows.length > 0;
  }

  async consumeOfflineGrant({grantId, businessId, deviceId, staffId, commandName, commandId, at}) {
    const {rows} = await this.client.query(`
      UPDATE offline_grants
      SET used_commands = used_commands + 1
      WHERE id = $1 AND business_id = $2 AND device_id = $3 AND staff_id = $4
        AND revoked_at IS NULL AND expires_at > $5
        AND used_commands < max_commands AND $6 = ANY(allowed_commands)
      RETURNING id
    `, [grantId, businessId, deviceId, staffId, at, commandName]);
    if (!rows.length) {
      const error = new Error('Offline grant is invalid, expired, exhausted, or does not permit this command.');
      error.status = 403;
      error.code = 'OFFLINE_GRANT_INVALID';
      throw error;
    }
    await this.client.query(
      'INSERT INTO offline_grant_commands (grant_id, command_id) VALUES ($1, $2)',
      [grantId, commandId],
    );
  }

  async nextChangeCursor(businessId) {
    const {rows} = await this.client.query(`
      INSERT INTO business_change_cursors (business_id, cursor)
      VALUES ($1, 1)
      ON CONFLICT (business_id) DO UPDATE SET cursor = business_change_cursors.cursor + 1
      RETURNING cursor
    `, [businessId]);
    return Number(rows[0].cursor);
  }

  async insertCommand({businessId, commandId, name, payloadHash, actor, outcome, at}) {
    await this.client.query(`
      INSERT INTO api_commands (business_id, command_id, command_name, payload_hash, staff_id, device_id, outcome, committed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    `, [businessId, commandId, name, payloadHash, actor.staffId, actor.deviceId, JSON.stringify(outcome), at]);
  }

  async insertAudit({businessId, commandId, name, actor, at}) {
    await this.client.query(`
      INSERT INTO business_audit_events (business_id, command_id, event_type, staff_id, device_id, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [businessId, commandId, name, actor.staffId, actor.deviceId, at]);
  }

  async insertChange({businessId, cursor, commandId, name, result, at}) {
    await this.client.query(`
      INSERT INTO business_changes (business_id, cursor, command_id, change_type, projection, occurred_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    `, [businessId, cursor, commandId, name, JSON.stringify(result), at]);
  }
}
