import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const migration = readFileSync(new URL('../src-tauri/migrations/001.sql', import.meta.url), 'utf8');
const database = () => { const db = new DatabaseSync(':memory:'); db.exec(migration); return db; };
test('audit and outbox commit atomically and enforce immutable attribution', () => {
  const db = database();
  db.exec('BEGIN');
  db.prepare('INSERT INTO records(collection,id,data) VALUES(?,?,?)').run('orders', 'order-1', '{}');
  db.prepare('INSERT INTO audit(id,command_id,actor_id,operation,occurred_at,payload) VALUES(?,?,?,?,?,?)').run('a1', 'c1', 'staff1', 'payment.record', '2026-09-24', '{}');
  db.prepare('INSERT INTO outbox(sequence,command_id,envelope) VALUES(?,?,?)').run(1, 'c1', '{}');
  db.exec('COMMIT');
  assert.throws(() => db.exec("UPDATE audit SET actor_id='other'"), /cannot be updated/);
  assert.throws(() => db.exec('DELETE FROM audit'), /cannot be deleted/);
  assert.throws(() => db.prepare('INSERT INTO outbox(sequence,command_id,envelope) VALUES(?,?,?)').run(99, 'c99', '{}'), /FOREIGN KEY/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM outbox WHERE acknowledged_at IS NULL').get().n, 1);
  db.close();
});
test('failed transaction retains neither financial records nor partial outbox changes', () => {
  const db = database(); db.exec('BEGIN');
  db.prepare('INSERT INTO records(collection,id,data) VALUES(?,?,?)').run('payments', 'p1', '{}');
  assert.throws(() => db.prepare('INSERT INTO outbox(sequence,command_id,envelope) VALUES(?,?,?)').run(1, 'missing-audit', '{}'));
  db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n, 0);
  db.close();
});
test('one receipt code per account and globally unique receipt identity', () => {
  const db = database();
  db.prepare('INSERT INTO mpesa_codes VALUES(?,?,?)').run('account1', 'ABC123', 'receipt1');
  assert.throws(() => db.prepare('INSERT INTO mpesa_codes VALUES(?,?,?)').run('account1', 'ABC123', 'receipt2'), /UNIQUE/);
  assert.throws(() => db.prepare('INSERT INTO mpesa_codes VALUES(?,?,?)').run('account2', 'ABC123', 'receipt1'), /UNIQUE/);
  db.prepare('INSERT INTO mpesa_codes VALUES(?,?,?)').run('account2', 'ABC123', 'receipt2');
  db.close();
});
test('records and pending outbox survive reopening and schema application', () => {
  const folder = mkdtempSync(join(tmpdir(), 'servos-schema-'));
  try {
    const path = join(folder, 'test.sqlite'); let db = new DatabaseSync(path); db.exec(migration);
    db.prepare('INSERT INTO records(collection,id,data) VALUES(?,?,?)').run('orders', 'o1', '{"grandTotal":100}');
    db.prepare('INSERT INTO audit(id,command_id,actor_id,operation,occurred_at,payload) VALUES(?,?,?,?,?,?)').run('a1','c1','u1','order.create','2026-09-24','{}');
    db.prepare('INSERT INTO outbox(sequence,command_id,envelope) VALUES(?,?,?)').run(1,'c1','{}'); db.close();
    db = new DatabaseSync(path); db.exec(migration);
    assert.equal(JSON.parse(db.prepare('SELECT data FROM records').get().data).grandTotal, 100);
    assert.equal(db.prepare('SELECT count(*) AS n FROM outbox WHERE acknowledged_at IS NULL').get().n, 1); db.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
