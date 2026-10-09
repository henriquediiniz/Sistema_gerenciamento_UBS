import { backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { database } from '../src/server/db';
import { databaseConfig } from '../src/server/database-config';
async function main() {
  if (databaseConfig().kind !== 'local')
    throw new Error('Para o banco remoto, use exportação/backup do provedor Turso.');
  mkdirSync('backups', { recursive: true });
  const file = resolve(`backups/ubs-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
  await backup(database(), file);
  console.log(`Backup consistente criado em ${file}`);
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao criar backup.');
  process.exitCode = 1;
});
