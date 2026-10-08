import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { one, run, now } from './db';
import { ensure } from '@/domain/rules';
import type { User, Role } from '@/domain/model';
export const publicUserColumns = 'id,name,email,role,area,patient_id';
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(value, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const dummyHash = hashPassword('constant-time-invalid-account');
export function login(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const attempt = one<{ attempts: number; window_start: number }>(
    'SELECT * FROM login_attempts WHERE email=?',
    normalized,
  );
  const time = Date.now();
  ensure(
    !attempt || time - attempt.window_start > 900000 || attempt.attempts < 10,
    'Muitas tentativas. Aguarde 15 minutos e tente novamente.',
    429,
  );
  const user = one<User & { password_hash: string }>(
    'SELECT * FROM users WHERE email=?',
    normalized,
  );
  const valid = verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !valid) {
    run(
      'INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END',
      normalized,
      time,
      time - 900000,
      time - 900000,
    );
    ensure(false, 'E-mail ou senha incorretos.', 401);
  }
  run('DELETE FROM login_attempts WHERE email=?', normalized);
  return createSession(user.id);
}
export function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  run('DELETE FROM sessions WHERE expires_at < ?', now());
  run(
    'INSERT INTO sessions VALUES(?,?,?)',
    digest(token),
    userId,
    new Date(Date.now() + 8 * 3600000).toISOString(),
  );
  return token;
}
export function sessionUser(token?: string): User | undefined {
  if (!token) return;
  return one<User>(
    `SELECT ${publicUserColumns
      .split(',')
      .map((c) => `u.${c}`)
      .join(
        ',',
      )} FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
    digest(token),
    now(),
  );
}
export function logout(token?: string) {
  if (token) run('DELETE FROM sessions WHERE token_hash=?', digest(token));
}
export function authorize(user: User, allowed: readonly Role[]) {
  ensure(allowed.includes(user.role), 'Seu perfil não tem permissão para esta operação.', 403);
}
export function visiblePatient(user: User, patientId: string) {
  const patient = one<{ id: string; area: string }>(
    'SELECT id,area FROM patients WHERE id=?',
    patientId,
  );
  ensure(patient, 'Paciente não encontrado.', 404);
  if (user.role === 'PACIENTE')
    ensure(user.patient_id === patientId, 'Acesso restrito ao próprio cadastro.', 403);
  if (user.role === 'ACS')
    ensure(patient.area === user.area, 'Paciente fora da sua área autorizada.', 403);
  return patient;
}
