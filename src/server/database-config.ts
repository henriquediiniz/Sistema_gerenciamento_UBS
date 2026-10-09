import { DomainError } from '@/domain/rules';
export class DatabaseConfigurationError extends DomainError {
  constructor(message: string) {
    super(message, 503);
    this.name = 'DatabaseConfigurationError';
  }
}
export function databaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.TURSO_DATABASE_URL?.trim();
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  if (!url) {
    if (env.VERCEL === '1')
      throw new DatabaseConfigurationError(
        'Banco de dados não configurado na publicação. Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN na Vercel e faça um novo deploy.',
      );
    return { kind: 'local' as const, path: env.DATABASE_PATH || 'data/ubs.sqlite' };
  }
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new DatabaseConfigurationError(
      'TURSO_DATABASE_URL inválida. Revise a configuração do banco.',
    );
  }
  if (
    !['libsql:', 'https:', 'file:'].includes(protocol) ||
    (env.VERCEL === '1' && protocol === 'file:')
  ) {
    throw new DatabaseConfigurationError(
      'Use um banco remoto libsql:// ou https:// na Vercel. Arquivos locais não são persistentes nessa hospedagem.',
    );
  }
  if (protocol !== 'file:' && !authToken)
    throw new DatabaseConfigurationError(
      'TURSO_AUTH_TOKEN não configurado. Defina o token do banco no ambiente do servidor.',
    );
  return { kind: 'libsql' as const, url, authToken };
}
export function requireRemoteDatabase() {
  const config = databaseConfig();
  if (config.kind !== 'libsql' || config.url.startsWith('file:'))
    throw new DatabaseConfigurationError(
      'Este comando exige TURSO_DATABASE_URL remota e TURSO_AUTH_TOKEN. Nenhum banco local foi alterado.',
    );
}
