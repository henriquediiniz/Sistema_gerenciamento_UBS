import { backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { database } from '../src/server/db';
async function main() {
  mkdirSync('backups', { recursive: true });
  const file = resolve(`backups/ubs-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
  await backup(database(), file);
  console.log(`Backup consistente criado em ${file}`);
}
main().catch(() => {
  console.error('Falha ao criar backup.');
  process.exitCode = 1;
});
