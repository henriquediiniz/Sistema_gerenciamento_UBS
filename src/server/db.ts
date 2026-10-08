import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const globalDb = globalThis as unknown as { ubsDb?: DatabaseSync };
export const databasePath =
  process.env.DATABASE_PATH === ':memory:'
    ? ':memory:'
    : resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || 'data/ubs.sqlite');
function connect() {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
 CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, document TEXT NOT NULL UNIQUE, birth_date TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', neighborhood TEXT NOT NULL, area TEXT NOT NULL, acs_id TEXT REFERENCES users(id), conditions TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('COORDENACAO','RECEPCAO','PROFISSIONAL','ESTOQUE','ACS','PACIENTE')), area TEXT NOT NULL DEFAULT '', patient_id TEXT UNIQUE REFERENCES patients(id));
 CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, service_id TEXT NOT NULL REFERENCES services(id), professional_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, period TEXT NOT NULL, starts_at TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity > 0), UNIQUE(professional_id,date,period));
 CREATE TABLE IF NOT EXISTS tickets (number INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, patient_id TEXT NOT NULL REFERENCES patients(id), slot_id TEXT NOT NULL REFERENCES slots(id), status TEXT NOT NULL CHECK(status IN ('RESERVADA','AGUARDANDO','EM_ATENDIMENTO','CONCLUIDA','AUSENTE','CANCELADA')), priority INTEGER NOT NULL DEFAULT 0 CHECK(priority IN (0,1)), checked_in_at TEXT, created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS tickets_slot ON tickets(slot_id,status);
 CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('VACINA','MEDICAMENTO')), unit TEXT NOT NULL, minimum INTEGER NOT NULL CHECK(minimum >= 0), alert_days INTEGER NOT NULL CHECK(alert_days >= 0));
 CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), code TEXT NOT NULL, expires_at TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity >= 0), blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)), UNIQUE(item_id,code));
 CREATE TABLE IF NOT EXISTS movements (id TEXT PRIMARY KEY, lot_id TEXT NOT NULL REFERENCES lots(id), delta INTEGER NOT NULL, reason TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES items(id), starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, audience TEXT NOT NULL, required_doses INTEGER NOT NULL CHECK(required_doses > 0));
 CREATE TABLE IF NOT EXISTS campaign_targets (campaign_id TEXT NOT NULL REFERENCES campaigns(id), neighborhood TEXT NOT NULL, population INTEGER NOT NULL CHECK(population >= 0), PRIMARY KEY(campaign_id,neighborhood));
 CREATE TABLE IF NOT EXISTS doses (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), lot_id TEXT NOT NULL REFERENCES lots(id), campaign_id TEXT REFERENCES campaigns(id), dose INTEGER NOT NULL CHECK(dose > 0), applied_at TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), idempotency_key TEXT NOT NULL UNIQUE);
 CREATE UNIQUE INDEX IF NOT EXISTS campaign_dose_unique ON doses(patient_id,campaign_id,dose) WHERE campaign_id IS NOT NULL;
 CREATE TABLE IF NOT EXISTS pending_doses (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), item_id TEXT NOT NULL REFERENCES items(id), due_date TEXT NOT NULL, note TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), acs_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PLANEJADA','REALIZADA','SEM_CONTATO')), result TEXT NOT NULL DEFAULT '', pending TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, entity_id TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
 INSERT OR IGNORE INTO schema_migrations VALUES(1,datetime('now'));
 `);
  return db;
}
export function database() {
  return (globalDb.ubsDb ??= connect());
}
// node:sqlite returns null-prototype records. Normalize them at the persistence
// boundary so they can cross the React Server Component serialization boundary.
export function all<T>(sql: string, ...params: SQLInputValue[]) {
  return database()
    .prepare(sql)
    .all(...params)
    .map((row) => ({ ...row })) as unknown as T[];
}
export function one<T>(sql: string, ...params: SQLInputValue[]) {
  const row = database()
    .prepare(sql)
    .get(...params);
  return row ? ({ ...row } as unknown as T) : undefined;
}
export function run(sql: string, ...params: SQLInputValue[]) {
  return database()
    .prepare(sql)
    .run(...params);
}
export function transaction<T>(work: () => T): T {
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function audit(userId: string, action: string, entityId: string, details: unknown = {}) {
  run(
    'INSERT INTO audit VALUES(?,?,?,?,?,?)',
    id(),
    userId,
    action,
    entityId,
    JSON.stringify(details),
    now(),
  );
}
