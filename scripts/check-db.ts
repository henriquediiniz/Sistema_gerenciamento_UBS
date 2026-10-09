import { one, closeDatabase } from '../src/server/db';
import { databaseConfig, requireRemoteDatabase } from '../src/server/database-config';
import { DomainError } from '../src/domain/rules';
import { safeErrorCode } from '../src/server/http-policy';
try {
  if (process.argv.includes('--remote')) requireRemoteDatabase();
  const config = databaseConfig();
  const result = await one<{ users: number; coordinators: number }>(
    "SELECT COUNT(*) users, SUM(CASE WHEN role='COORDENACAO' THEN 1 ELSE 0 END) coordinators FROM users",
  );
  console.log({
    database: config.kind,
    connected: true,
    users: result?.users || 0,
    coordinators: result?.coordinators || 0,
  });
  if (!result?.users)
    console.log(
      'Base vazia. Execute o seed neste mesmo ambiente antes de usar os logins de demonstração.',
    );
} catch (error) {
  console.error(
    error instanceof DomainError
      ? error.message
      : `Falha ao acessar banco (${safeErrorCode(error)}).`,
  );
  process.exitCode = 1;
} finally {
  closeDatabase();
}
