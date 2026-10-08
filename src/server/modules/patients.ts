import { patientSchema, registerSchema, text } from '@/domain/schemas';
import { ensure, today } from '@/domain/rules';
import type { User } from '@/domain/model';
import { audit, id, now, one, run, transaction } from '../db';
import { authorize, hashPassword, visiblePatient } from '../security';
function validatePatient(data: ReturnType<typeof patientSchema.parse>) {
  ensure(data.birth_date <= today(), 'A data de nascimento não pode estar no futuro.');
  if (data.acs_id) {
    const acs = one<User>('SELECT * FROM users WHERE id=? AND role=?', data.acs_id, 'ACS');
    ensure(acs && acs.area === data.area, 'Selecione um ACS da mesma área do paciente.');
  }
}
export function savePatient(user: User, input: unknown, patientId?: string) {
  authorize(user, ['COORDENACAO', 'RECEPCAO', 'PACIENTE']);
  const data = patientSchema.parse(input);
  validatePatient(data);
  return transaction(() => {
    const key = patientId || id();
    if (patientId) {
      visiblePatient(user, patientId);
      const before = one('SELECT * FROM patients WHERE id=?', patientId);
      if (user.role === 'PACIENTE') {
        const old = one<{ area: string; acs_id: string | null }>(
          'SELECT area,acs_id FROM patients WHERE id=?',
          patientId,
        )!;
        ensure(
          old.area === data.area && (old.acs_id || null) === (data.acs_id || null),
          'A vinculação de área e ACS deve ser alterada pela equipe.',
          403,
        );
      }
      run(
        'UPDATE patients SET name=?,document=?,birth_date=?,phone=?,neighborhood=?,area=?,acs_id=? WHERE id=?',
        data.name,
        data.document,
        data.birth_date,
        data.phone,
        data.neighborhood,
        data.area,
        data.acs_id || null,
        key,
      );
      audit(user.id, 'Paciente atualizado', key, { before, after: data });
    } else {
      ensure(user.role !== 'PACIENTE', 'O paciente só pode editar o próprio cadastro.', 403);
      insertPatient(key, data);
      audit(user.id, 'Paciente cadastrado', key);
    }
    return { id: key };
  });
}
function insertPatient(key: string, data: ReturnType<typeof patientSchema.parse>) {
  run(
    'INSERT INTO patients VALUES(?,?,?,?,?,?,?,?,?,?)',
    key,
    data.name,
    data.document,
    data.birth_date,
    data.phone,
    data.neighborhood,
    data.area,
    data.acs_id || null,
    '',
    now(),
  );
}
export function register(input: unknown) {
  const data = registerSchema.parse(input);
  data.acs_id = null;
  validatePatient(data);
  return transaction(() => {
    const patientId = id(),
      userId = id();
    insertPatient(patientId, data);
    run(
      'INSERT INTO users VALUES(?,?,?,?,?,?,?)',
      userId,
      data.name,
      data.email.toLowerCase(),
      hashPassword(data.password),
      'PACIENTE',
      data.area,
      patientId,
    );
    audit(userId, 'Autocadastro', patientId);
    return userId;
  });
}
export function recordCondition(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'PROFISSIONAL']);
  const data = input as { patient_id: unknown; conditions: unknown };
  const key = text.parse(data.patient_id);
  const conditions = text.parse(data.conditions);
  visiblePatient(user, key);
  return transaction(() => {
    const before = one('SELECT conditions FROM patients WHERE id=?', key);
    run('UPDATE patients SET conditions=? WHERE id=?', conditions, key);
    audit(user.id, 'Acompanhamento atualizado', key, { before, conditions });
    return { id: key };
  });
}
