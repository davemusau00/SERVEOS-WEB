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

  async catalogProjection(businessId) {
    const [productsResult,stockResult,locationsResult,outletsResult] = await Promise.all([
      this.pool.query(`SELECT p.id,p.name,p.code,p.price_minor AS "priceMinor",p.category,p.route_to AS "routeTo",p.stock_item_id AS "stockItemId",p.barcode,p.favorite,p.tax_class_id AS "taxClassId",p.inventory_type AS "inventoryType",p.recipe_yield AS "recipeYield",p.portion_volume AS "portionVolume",p.selling_mode AS "sellingMode",p.portions,p.outlet_ids AS "outletIds",p.version FROM products p WHERE p.business_id=$1 AND p.archived_at IS NULL ORDER BY p.name,p.id`,[businessId]),
      this.pool.query(`SELECT s.id,s.name,s.code,s.base_unit AS "baseUnit",s.barcode,s.barcode_aliases AS "barcodeAliases",s.scan_unit_quantity AS "scanUnitQuantity",s.reorder_level AS "reorderLevel",s.average_unit_cost_minor AS "averageUnitCostMinor",s.sealed_container_size AS "sealedContainerSize",s.version,COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'baseQuantity',p.base_quantity,'unitCostMinor',p.unit_cost_minor,'barcode',p.barcode) ORDER BY p.sort_order) FILTER (WHERE p.id IS NOT NULL),'[]'::jsonb) AS "purchasePackages" FROM stock_items s LEFT JOIN stock_purchase_packages p ON p.business_id=s.business_id AND p.stock_item_id=s.id WHERE s.business_id=$1 AND s.archived_at IS NULL GROUP BY s.business_id,s.id ORDER BY s.name,s.id`,[businessId]),
      this.pool.query(`SELECT id,name,version FROM stock_locations WHERE business_id=$1 AND archived_at IS NULL ORDER BY name,id`,[businessId]),
      this.pool.query(`SELECT id,name,default_stock_location_id AS "defaultStockLocationId",version FROM business_outlets WHERE business_id=$1 AND archived_at IS NULL ORDER BY name,id`,[businessId]),
    ]);
    const recipes = await this.pool.query(`SELECT product_id AS "productId",stock_item_id AS "stockItemId",quantity,unit FROM product_recipe_ingredients WHERE business_id=$1 ORDER BY product_id,stock_item_id`,[businessId]);
    const ingredientsByProduct = new Map();
    for(const ingredient of recipes.rows){const list=ingredientsByProduct.get(ingredient.productId)||[];list.push({...ingredient,quantity:Number(ingredient.quantity)});ingredientsByProduct.set(ingredient.productId,list);}
    return {
      products:productsResult.rows.map(row=>({collection:'products',id:row.id,version:Number(row.version),data:{...row,priceMinor:Number(row.priceMinor),recipeIngredients:ingredientsByProduct.get(row.id)||[]}})),
      stockItems:stockResult.rows.map(row=>({collection:'stockItems',id:row.id,version:Number(row.version),data:{...row,scanUnitQuantity:Number(row.scanUnitQuantity),reorderLevel:Number(row.reorderLevel),averageUnitCostMinor:Number(row.averageUnitCostMinor),sealedContainerSize:row.sealedContainerSize===null?undefined:Number(row.sealedContainerSize),purchasePackages:row.purchasePackages.map(pack=>({...pack,baseQuantity:Number(pack.baseQuantity),unitCostMinor:Number(pack.unitCostMinor)}))}})),
      stockLocations:locationsResult.rows.map(row=>({collection:'stockLocations',id:row.id,version:Number(row.version),data:{name:row.name}})),
      outlets:outletsResult.rows.map(row=>({collection:'outlets',id:row.id,version:Number(row.version),data:{name:row.name,defaultStockLocationId:row.defaultStockLocationId}})),
    };
  }

  async authenticateSession(tokenHash, deviceId, now = new Date()) {
    const {rows} = await this.pool.query(`
      SELECT s.business_id AS "businessId", s.staff_id AS "staffId", d.id AS "deviceId",
             COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
      FROM api_staff_sessions s
      JOIN api_enrolled_devices d ON d.business_id = s.business_id AND d.staff_id = s.staff_id AND d.id = $2
      LEFT JOIN api_staff_permissions p ON p.business_id = s.business_id AND p.staff_id = s.staff_id
      JOIN api_staff_profiles f ON f.business_id=s.business_id AND f.staff_id=s.staff_id AND f.active AND NOT f.must_change_password
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $3 AND s.device_id=d.id
        AND d.revoked_at IS NULL
      GROUP BY s.business_id, s.staff_id, d.id
    `, [tokenHash, deviceId, now]);
    return rows[0] ?? null;
  }

  async authenticateStaffSession(tokenHash, now = new Date()) {
    const {rows} = await this.pool.query(`
      SELECT s.business_id AS "businessId", s.staff_id AS "staffId",s.id AS "sessionId",d.id AS "deviceId",f.must_change_password AS "mustChangePassword",
             COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
      FROM api_staff_sessions s
      JOIN api_staff_profiles f ON f.business_id=s.business_id AND f.staff_id=s.staff_id AND f.active
      LEFT JOIN api_enrolled_devices d ON d.business_id=s.business_id AND d.id=s.device_id AND d.revoked_at IS NULL
      LEFT JOIN api_staff_permissions p ON p.business_id = s.business_id AND p.staff_id = s.staff_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2
      GROUP BY s.business_id, s.staff_id,s.id,d.id,f.must_change_password
    `, [tokenHash, now]);
    return rows[0] ?? null;
  }

  async authenticatePassword({loginName,password,at,verifyPassword,sessionId,tokenHash,expiresAt}) {
    return this.transaction(async tx=>{
      const {rows}=await tx.client.query(`SELECT business_id AS "businessId",staff_id AS "staffId",display_name AS "displayName",credential_hash AS "credentialHash",failed_login_count AS "failedLoginCount",locked_until AS "lockedUntil",must_change_password AS "mustChangePassword" FROM api_staff_profiles WHERE lower(login_name)=lower($1) AND active FOR UPDATE`,[loginName]);
      const staff=rows[0];
      // Do equivalent work for unknown usernames to reduce account enumeration timing differences.
      const valid=staff&&!staff.lockedUntil&&await verifyPassword(password,staff.credentialHash);
      if(!valid){
        if(staff){const failures=Number(staff.failedLoginCount)+1;await tx.client.query('UPDATE api_staff_profiles SET failed_login_count=$3,locked_until=$4,updated_at=$5 WHERE business_id=$1 AND staff_id=$2',[staff.businessId,staff.staffId,failures,failures>=5?new Date(at.getTime()+15*60_000):null,at]);}
        return null;
      }
      await tx.client.query('UPDATE api_staff_profiles SET failed_login_count=0,locked_until=NULL,updated_at=$3 WHERE business_id=$1 AND staff_id=$2',[staff.businessId,staff.staffId,at]);
      await tx.client.query('INSERT INTO api_staff_sessions(id,business_id,staff_id,token_hash,created_at,expires_at,device_id) VALUES($1,$2,$3,$4,$5,$6,NULL)',[sessionId,staff.businessId,staff.staffId,tokenHash,at,expiresAt]);
      const {rows:permissions}=await tx.client.query('SELECT permission FROM api_staff_permissions WHERE business_id=$1 AND staff_id=$2 ORDER BY permission',[staff.businessId,staff.staffId]);
      return {sessionId,businessId:staff.businessId,staffId:staff.staffId,displayName:staff.displayName,permissions:permissions.map(row=>row.permission),expiresAt:expiresAt.toISOString(),mustChangePassword:staff.mustChangePassword};
    });
  }

  async checkLoginThrottle(bucketHashes,at){
    const {rows}=await this.pool.query('SELECT bucket_hash FROM api_auth_attempts WHERE bucket_hash=ANY($1::char(64)[]) AND blocked_until>$2',[bucketHashes,at]);return rows.length===0;
  }
  async recordLoginFailure(bucketHashes,at){
    await this.transaction(async tx=>{for(const bucketHash of bucketHashes){await tx.client.query(`INSERT INTO api_auth_attempts(bucket_hash,attempt_count,window_started_at,blocked_until) VALUES($1,1,$2,NULL) ON CONFLICT(bucket_hash) DO UPDATE SET attempt_count=CASE WHEN api_auth_attempts.window_started_at<$2-interval '15 minutes' THEN 1 ELSE api_auth_attempts.attempt_count+1 END,window_started_at=CASE WHEN api_auth_attempts.window_started_at<$2-interval '15 minutes' THEN $2 ELSE api_auth_attempts.window_started_at END,blocked_until=CASE WHEN (CASE WHEN api_auth_attempts.window_started_at<$2-interval '15 minutes' THEN 1 ELSE api_auth_attempts.attempt_count+1 END)>=20 THEN $2+interval '15 minutes' ELSE NULL END`,[bucketHash,at]);}});
  }
  async clearLoginFailures(bucketHashes){await this.pool.query('DELETE FROM api_auth_attempts WHERE bucket_hash=ANY($1::char(64)[])',[bucketHashes]);}

  async createInitialAdmin({setupSecretHash,expectedSetupSecretHash,businessId,businessName,staffId,loginName,displayName,credentialHash,permissions,at}) {
    if(setupSecretHash!==expectedSetupSecretHash)return false;
    return this.transaction(async tx=>{
      await tx.client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['serveos:initial-admin']);
      const {rows}=await tx.client.query('SELECT count(*)::int AS count FROM api_staff_profiles');
      if(rows[0].count!==0)return false;
      await tx.client.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,businessName]);
      await tx.client.query('INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password,created_at,updated_at) VALUES($1,$2,$3,$4,\'Admin\',$5,true,$6,$6)',[businessId,staffId,loginName,displayName,credentialHash,at]);
      for(const permission of permissions)await tx.client.query('INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,$3)',[businessId,staffId,permission]);
      return true;
    });
  }

  async changePassword({businessId,staffId,currentHash,newHash,at}) {
    const {rows}=await this.pool.query('UPDATE api_staff_profiles SET credential_hash=$4,must_change_password=false,failed_login_count=0,locked_until=NULL,updated_at=$5 WHERE business_id=$1 AND staff_id=$2 AND credential_hash=$3 RETURNING staff_id',[businessId,staffId,currentHash,newHash,at]);
    return rows.length>0;
  }

  async staffCredential(businessId,staffId){
    const {rows}=await this.pool.query('SELECT display_name AS "displayName",credential_hash AS "credentialHash",must_change_password AS "mustChangePassword" FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2 AND active',[businessId,staffId]);return rows[0]??null;
  }

  async updateCredential(businessId,staffId,credentialHash,at){
    await this.pool.query('UPDATE api_staff_profiles SET credential_hash=$3,must_change_password=false,failed_login_count=0,locked_until=NULL,updated_at=$4 WHERE business_id=$1 AND staff_id=$2',[businessId,staffId,credentialHash,at]);
  }

  async revokeSession(tokenHash,at=new Date()) {
    const {rowCount}=await this.pool.query('UPDATE api_staff_sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL',[tokenHash,at]);
    return rowCount>0;
  }

  async issueDeviceEnrollmentChallenge({challengeId, challenge, businessId, staffId, issuedAt, expiresAt}) {
    const {rows: recent} = await this.pool.query(`
      SELECT count(*)::int AS count FROM api_device_enrollment_challenges
      WHERE business_id = $1 AND staff_id = $2 AND issued_at > $3
    `, [businessId, staffId, new Date(issuedAt.getTime() - 60 * 60_000)]);
    if (recent[0].count >= 10) {
      const error = new Error('Too many device enrollment challenges were requested.');
      error.status = 429;
      error.code = 'RATE_LIMITED';
      throw error;
    }
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

  async enrollDevice({challengeId, businessId, staffId, deviceId, publicKey, sessionId, at}) {
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
      const {rowCount}=await tx.client.query('UPDATE api_staff_sessions SET device_id=$2 WHERE id=$1 AND business_id=$3 AND staff_id=$4 AND device_id IS NULL AND revoked_at IS NULL AND expires_at>$5',[sessionId,deviceId,businessId,staffId,at]);
      if(rowCount!==1){const error=new Error('The API session could not be bound to this device.');error.status=409;error.code='SESSION_BINDING_FAILED';throw error;}
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

  async requireStockLocation(businessId, locationId) {
    const {rows} = await this.client.query(
      'SELECT 1 FROM stock_locations WHERE business_id = $1 AND id = $2 AND archived_at IS NULL FOR SHARE',
      [businessId, locationId],
    );
    return rows.length > 0;
  }

  async findBusinessCode(table, businessId, code, exceptId = null) {
    if (!['products', 'stock_items'].includes(table)) throw new Error('Unsupported code lookup table.');
    const {rows} = await this.client.query(
      `SELECT id FROM ${table} WHERE business_id = $1 AND lower(code) = lower($2) AND archived_at IS NULL AND ($3::uuid IS NULL OR id <> $3) LIMIT 1`,
      [businessId, code, exceptId],
    );
    return rows[0] ?? null;
  }

  async findBusinessBarcode(table, businessId, barcode, exceptId = null) {
    if (!['products', 'stock_items'].includes(table)) throw new Error('Unsupported barcode lookup table.');
    const {rows} = await this.client.query(
      `SELECT id FROM ${table} WHERE business_id = $1 AND lower(barcode) = lower($2) AND archived_at IS NULL AND ($3::uuid IS NULL OR id <> $3) LIMIT 1`,
      [businessId, barcode, exceptId],
    );
    return rows[0] ?? null;
  }

  async findStockBarcode(businessId, barcode, exceptStockId = null) {
    const {rows} = await this.client.query(`
      SELECT id FROM stock_items WHERE business_id=$1 AND (lower(barcode)=lower($2) OR lower(code)=lower($2) OR lower($2)=ANY(barcode_aliases)) AND archived_at IS NULL AND ($3::uuid IS NULL OR id<>$3)
      UNION ALL
      SELECT stock_item_id AS id FROM stock_purchase_packages WHERE business_id=$1 AND lower(barcode)=lower($2) AND ($3::uuid IS NULL OR stock_item_id<>$3)
      LIMIT 1
    `, [businessId,barcode,exceptStockId]);
    return rows[0] ?? null;
  }

  async requireStockItems(businessId, ids) {
    if (!ids.length) return true;
    const {rows} = await this.client.query(
      'SELECT id FROM stock_items WHERE business_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL FOR SHARE',
      [businessId, ids],
    );
    return rows.length === new Set(ids).size;
  }

  async requireOutlets(businessId, ids) {
    if(!ids.length)return true;
    const {rows}=await this.client.query('SELECT id FROM business_outlets WHERE business_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL FOR SHARE',[businessId,ids]);
    return rows.length===new Set(ids).size;
  }

  async saveStockItem(item) {
    await this.client.query(`
      INSERT INTO stock_items (business_id,id,name,code,base_unit,barcode,barcode_aliases,scan_unit_quantity,reorder_level,average_unit_cost_minor,sealed_container_size,version,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      ON CONFLICT (business_id,id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, base_unit=EXCLUDED.base_unit,
        barcode=EXCLUDED.barcode, barcode_aliases=EXCLUDED.barcode_aliases, scan_unit_quantity=EXCLUDED.scan_unit_quantity,
        reorder_level=EXCLUDED.reorder_level, average_unit_cost_minor=EXCLUDED.average_unit_cost_minor,
        sealed_container_size=EXCLUDED.sealed_container_size, version=EXCLUDED.version, updated_by=EXCLUDED.updated_by, updated_at=now()
    `, [item.businessId,item.id,item.name,item.code,item.baseUnit,item.barcode,item.barcodeAliases,item.scanUnitQuantity,item.reorderLevel,item.averageUnitCostMinor,item.sealedContainerSize,item.version,item.staffId]);
    await this.client.query('DELETE FROM stock_purchase_packages WHERE business_id=$1 AND stock_item_id=$2', [item.businessId,item.id]);
    for (const [index, pack] of item.purchasePackages.entries()) await this.client.query(`
      INSERT INTO stock_purchase_packages (business_id,stock_item_id,id,name,base_quantity,unit_cost_minor,barcode,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [item.businessId,item.id,pack.id,pack.name,pack.baseQuantity ?? pack.quantity,pack.unitCostMinor,pack.barcode,index]);
  }

  async saveProduct(product) {
    await this.client.query(`
      INSERT INTO products (business_id,id,name,code,price_minor,category,route_to,stock_item_id,barcode,favorite,tax_class_id,recipe,inventory_type,recipe_yield,portion_volume,selling_mode,portions,outlet_ids,version,created_by,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::uuid[],$19,$20,$20)
      ON CONFLICT (business_id,id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, price_minor=EXCLUDED.price_minor,
        category=EXCLUDED.category, route_to=EXCLUDED.route_to, stock_item_id=EXCLUDED.stock_item_id, barcode=EXCLUDED.barcode,
        favorite=EXCLUDED.favorite,tax_class_id=EXCLUDED.tax_class_id,recipe=EXCLUDED.recipe,inventory_type=EXCLUDED.inventory_type,recipe_yield=EXCLUDED.recipe_yield,
        portion_volume=EXCLUDED.portion_volume,selling_mode=EXCLUDED.selling_mode,portions=EXCLUDED.portions,outlet_ids=EXCLUDED.outlet_ids,version=EXCLUDED.version,
        updated_by=EXCLUDED.updated_by,updated_at=now()
    `, [product.businessId,product.id,product.name,product.code,product.priceMinor,product.category,product.routeTo,product.stockItemId,product.barcode,product.favorite,product.taxClassId,product.recipe,product.inventoryType,product.recipeYield,product.portionVolume,product.sellingMode,JSON.stringify(product.portions),product.outletIds,product.version,product.staffId]);
    await this.client.query('DELETE FROM product_recipe_ingredients WHERE business_id=$1 AND product_id=$2', [product.businessId,product.id]);
    for (const ingredient of product.recipeIngredients) await this.client.query(`
      INSERT INTO product_recipe_ingredients (business_id,product_id,stock_item_id,quantity,unit) VALUES ($1,$2,$3,$4,$5)
    `, [product.businessId,product.id,ingredient.stockItemId,ingredient.quantity,ingredient.unit]);
    await this.client.query('DELETE FROM product_outlets WHERE business_id=$1 AND product_id=$2',[product.businessId,product.id]);
    for(const outletId of product.outletIds)await this.client.query('INSERT INTO product_outlets (business_id,product_id,outlet_id) VALUES ($1,$2,$3)',[product.businessId,product.id,outletId]);
  }

  async createOpeningStockMovement({businessId, id, stockItemId, locationId, quantity, commandId, staffId, at}) {
    await this.client.query(`
      INSERT INTO inventory_movements (business_id,id,stock_item_id,location_id,quantity_delta,reason,source_command_id,staff_id,occurred_at)
      VALUES ($1,$2,$3,$4,$5,'OPENING_BALANCE',$6,$7,$8)
    `, [businessId,id,stockItemId,locationId,quantity,commandId,staffId,at]);
  }

  async upsertInventoryBalance({businessId,stockItemId,locationId,quantityDelta}) {
    await this.client.query(`
      INSERT INTO inventory_location_balances (business_id,stock_item_id,location_id,quantity,version)
      VALUES ($1,$2,$3,$4,1)
      ON CONFLICT (business_id,stock_item_id,location_id) DO UPDATE SET quantity=inventory_location_balances.quantity+EXCLUDED.quantity,version=inventory_location_balances.version+1
    `,[businessId,stockItemId,locationId,quantityDelta]);
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
