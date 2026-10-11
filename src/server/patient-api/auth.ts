import { createHash, randomBytes } from 'node:crypto';
import { ensure } from '@/domain/rules';
import type { User } from '@/domain/model';
import { one, run, now } from '../db';
import { authenticate, publicUserColumns } from '../security';
import { userOutput } from './contracts';

const lifetime = 8 * 60 * 60;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export async function patientLogin(email: string, password: string) {
  const user = await authenticate(email, password);
  ensure(
    user.role === 'PACIENTE' && user.patient_id,
    'Este aplicativo é exclusivo para pacientes.',
    403,
  );
  const token = randomBytes(32).toString('hex');
  const expires_at = new Date(Date.now() + lifetime * 1000).toISOString();
  await run('DELETE FROM patient_sessions WHERE expires_at <= ?', now());
  await run('INSERT INTO patient_sessions VALUES(?,?,?)', digest(token), user.id, expires_at);
  return {
    access_token: token,
    token_type: 'Bearer' as const,
    expires_in: lifetime,
    expires_at,
    user: userOutput.parse(user),
  };
}
export function bearerToken(request: Request) {
  const match = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get('authorization') || '');
  ensure(match, 'Envie um token de sessão no cabeçalho Authorization: Bearer.', 401);
  return match[1];
}
export async function patientSession(token: string): Promise<User> {
  const columns = publicUserColumns
    .split(',')
    .map((c) => `u.${c}`)
    .join(',');
  const user = await one<User>(
    `SELECT ${columns} FROM patient_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
    digest(token),
    now(),
  );
  ensure(user, 'Sua sessão expirou. Entre novamente.', 401);
  ensure(
    user.role === 'PACIENTE' && user.patient_id,
    'Este aplicativo é exclusivo para pacientes.',
    403,
  );
  return user;
}
export async function patientLogout(token: string) {
  await run('DELETE FROM patient_sessions WHERE token_hash=?', digest(token));
}
