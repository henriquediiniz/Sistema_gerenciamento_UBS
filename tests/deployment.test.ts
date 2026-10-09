import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig, DatabaseConfigurationError } from '../src/server/database-config';
import { expectedOrigin, secureCookie, safeErrorCode } from '../src/server/http-policy';
const env = (values: Record<string, string>): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  ...values,
});
test('Vercel sem banco remoto falha com diagnóstico 503 antes de tentar escrever no disco', () => {
  assert.throws(
    () => databaseConfig(env({ VERCEL: '1' })),
    (error) =>
      error instanceof DatabaseConfigurationError &&
      error.status === 503 &&
      error.message.includes('TURSO_DATABASE_URL'),
  );
});
test('Vercel não aceita SQLite em arquivo, inclusive em /tmp', () => {
  assert.throws(
    () => databaseConfig(env({ VERCEL: '1', TURSO_DATABASE_URL: 'file:/tmp/ubs.sqlite' })),
    /Arquivos locais/,
  );
});
test('banco remoto exige token e protocolo seguro', () => {
  assert.throws(
    () => databaseConfig(env({ TURSO_DATABASE_URL: 'libsql://test.turso.io' })),
    /TURSO_AUTH_TOKEN/,
  );
  assert.throws(
    () =>
      databaseConfig(env({ TURSO_DATABASE_URL: 'http://test.turso.io', TURSO_AUTH_TOKEN: 'fake' })),
    /remoto/,
  );
  assert.equal(
    databaseConfig(env({ TURSO_DATABASE_URL: 'libsql://test.turso.io', TURSO_AUTH_TOKEN: 'fake' }))
      .kind,
    'libsql',
  );
});
test('SQLite local continua sendo o padrão fora da Vercel', () => {
  assert.deepEqual(databaseConfig(env({ DATABASE_PATH: ':memory:' })), {
    kind: 'local',
    path: ':memory:',
  });
});
test('cookies sempre seguros na Vercel e origem usa HTTPS do deploy', () => {
  const e = env({ VERCEL: '1', COOKIE_SECURE: 'false' });
  assert(secureCookie(e));
  assert.equal(expectedOrigin('http:', 'ubs.vercel.app', e), 'https://ubs.vercel.app');
  assert.equal(expectedOrigin('http:', '127.0.0.1:3000', env({})), 'http://127.0.0.1:3000');
});
test('origem explícita mantém domínio configurado e ignora barra final', () => {
  assert.equal(
    expectedOrigin('http:', 'internal.local', env({ APP_ORIGIN: 'https://ubs.exemplo.com/' })),
    'https://ubs.exemplo.com',
  );
});
test('diagnósticos não incluem mensagens, SQL ou tokens de autenticação', () => {
  assert.equal(safeErrorCode({ code: 'SQLITE_BUSY', message: 'segredo' }), 'SQLITE_BUSY');
  assert.equal(safeErrorCode({ code: 'libsql://token-secreto' }), 'UNKNOWN');
});
