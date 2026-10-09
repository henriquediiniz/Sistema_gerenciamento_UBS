import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type Client } from '@libsql/client';
import { databaseConfig } from './database-config';
import { schema } from './schema';
type Value = string | number | bigint | null;
type Row = Record<string, unknown>;
type Executor = (sql: string, args: Value[]) => Promise<Row[]>;
// Shared across Next hot reloads. AsyncLocalStorage isolates simultaneous requests:
// one request can never execute queries on another request's transaction.
const state = globalThis as unknown as {
  ubsDb?: DatabaseSync;
  ubsRemote?: Client;
  ubsRemoteReady?: Promise<void>;
  ubsTransactionContext?: AsyncLocalStorage<Executor>;
  ubsLocalQueue?: Promise<unknown>;
};
const context = (state.ubsTransactionContext ??= new AsyncLocalStorage<Executor>());
export const databasePath =
  process.env.DATABASE_PATH === ':memory:'
    ? ':memory:'
    : resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || 'data/ubs.sqlite');
export function database() {
  const config = databaseConfig();
  if (config.kind !== 'local')
    throw new Error('Acesso a arquivo local indisponível quando o banco remoto está configurado.');
  if (!state.ubsDb) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    const db = new DatabaseSync(databasePath);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    db.exec(schema);
    state.ubsDb = db;
  }
  return state.ubsDb;
}
async function remote() {
  const config = databaseConfig();
  if (config.kind !== 'libsql') throw new Error('Banco remoto não configurado.');
  const client = (state.ubsRemote ??= createClient({
    url: config.url,
    authToken: config.authToken,
    intMode: 'number',
  }));
  if (!state.ubsRemoteReady) {
    state.ubsRemoteReady = client
      .batch(
        schema
          .split(';')
          .map((sql) => sql.trim())
          .filter(Boolean),
        'write',
      )
      .then(() => {})
      .catch((error) => {
        state.ubsRemoteReady = undefined;
        throw error;
      });
  }
  await state.ubsRemoteReady;
  return client;
}
async function localExclusive<T>(work: () => Promise<T>): Promise<T> {
  const previous = state.ubsLocalQueue ?? Promise.resolve();
  let release!: () => void;
  state.ubsLocalQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}
const nativeExecute: Executor = async (sql, args) =>
  database()
    .prepare(sql)
    .all(...args)
    .map((row) => ({ ...row }));
async function execute(sql: string, args: Value[]): Promise<Row[]> {
  const active = context.getStore();
  if (active) return active(sql, args);
  if (databaseConfig().kind === 'local') return localExclusive(() => nativeExecute(sql, args));
  const query = async () => {
    const result = await (await remote()).execute({ sql, args });
    return result.rows.map((row) => ({ ...row }));
  };
  return isLibsqlFile() ? localExclusive(query) : query();
}
export async function all<T>(sql: string, ...params: Value[]): Promise<T[]> {
  return (await execute(sql, params)) as T[];
}
export async function one<T>(sql: string, ...params: Value[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}
export async function run(sql: string, ...params: Value[]) {
  await execute(sql, params);
}
export async function transaction<T>(work: () => Promise<T>): Promise<T> {
  if (context.getStore()) throw new Error('Transações aninhadas não são suportadas.');
  if (databaseConfig().kind === 'local')
    return localExclusive(async () => {
      const db = database();
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await context.run(nativeExecute, work);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
  const executeTransaction = async () => {
    const tx = await (await remote()).transaction('write');
    try {
      const result = await context.run(
        async (sql, args) => (await tx.execute({ sql, args })).rows.map((row) => ({ ...row })),
        work,
      );
      await tx.commit();
      return result;
    } catch (error) {
      if (!tx.closed) await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  };
  return isLibsqlFile() ? localExclusive(executeTransaction) : executeTransaction();
}
function isLibsqlFile() {
  const config = databaseConfig();
  return config.kind === 'libsql' && config.url.startsWith('file:');
}
// Administrative scripts only. Application operations use parameterized queries.
export async function executeScript(sql: string) {
  if (databaseConfig().kind === 'local')
    await localExclusive(async () => {
      database().exec(sql);
    });
  else await (await remote()).executeMultiple(sql);
}
export function closeDatabase() {
  state.ubsRemote?.close();
  state.ubsDb?.close();
  state.ubsRemote = undefined;
  state.ubsDb = undefined;
  state.ubsRemoteReady = undefined;
}
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export async function audit(
  userId: string,
  action: string,
  entityId: string,
  details: unknown = {},
) {
  await run(
    'INSERT INTO audit VALUES(?,?,?,?,?,?)',
    id(),
    userId,
    action,
    entityId,
    JSON.stringify(details),
    now(),
  );
}
export type Statement = { sql: string; args: Value[] };
// One network round trip for setup/imports; no long interactive seed transaction.
export async function batch(statements: Statement[]) {
  if (context.getStore()) throw new Error('Batch deve iniciar sua própria transação.');
  if (databaseConfig().kind === 'local')
    await transaction(async () => {
      for (const s of statements) await run(s.sql, ...s.args);
    });
  else await (await remote()).batch(statements, 'write');
}
