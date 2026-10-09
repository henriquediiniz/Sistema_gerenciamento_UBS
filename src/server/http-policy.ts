export function expectedOrigin(
  protocol: string,
  host: string | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  // Trust the deployment configuration, never an arbitrary forwarded header.
  return (
    env.APP_ORIGIN?.trim().replace(/\/$/, '') ||
    `${env.VERCEL === '1' ? 'https:' : protocol}//${host}`
  );
}
export function secureCookie(env: NodeJS.ProcessEnv = process.env) {
  return env.VERCEL === '1' || env.COOKIE_SECURE === 'true';
}
export function safeErrorCode(error: unknown) {
  if (typeof error !== 'object' || !error || !('code' in error)) return 'UNKNOWN';
  const code = String(error.code);
  return /^[A-Z0-9_]{1,60}$/.test(code) ? code : 'UNKNOWN';
}
