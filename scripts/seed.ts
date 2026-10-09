import { seed } from '../src/server/seed';
import { closeDatabase } from '../src/server/db';
import { DomainError } from '../src/domain/rules';
import { safeErrorCode } from '../src/server/http-policy';
import { requireRemoteDatabase } from '../src/server/database-config';
try {
  if (process.argv.includes('--remote')) requireRemoteDatabase();
  await seed();
} catch (error) {
  console.error(
    error instanceof DomainError
      ? error.message
      : `Falha ao inicializar banco (${safeErrorCode(error)}). Revise as variáveis e a conectividade.`,
  );
  process.exitCode = 1;
} finally {
  closeDatabase();
}
