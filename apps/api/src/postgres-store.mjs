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
