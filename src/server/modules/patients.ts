import { patientSchema, registerSchema, text } from '@/domain/schemas';
import { ensure, today } from '@/domain/rules';
import type { User } from '@/domain/model';
import { audit, id, now, one, run, transaction } from '../db';
import { authorize, hashPassword, visiblePatient } from '../security';
async function validatePatient(data: ReturnType<typeof patientSchema.parse>) {
  ensure(data.birth_date <= today(), 'A data de nascimento não pode estar no futuro.');
  if (data.acs_id) {
    const acs = await one<User>('SELECT * FROM users WHERE id=? AND role=?', data.acs_id, 'ACS');
    ensure(acs && acs.area === data.area, 'Selecione um ACS da mesma área do paciente.');
  }
}
export async function savePatient(user: User, input: unknown, patientId?: string) {
  authorize(user, ['COORDENACAO', 'RECEPCAO', 'PACIENTE']);
  const data = patientSchema.parse(input);
  await validatePatient(data);
  return await transaction(async () => {
    const key = patientId || id();
    if (patientId) {
      await visiblePatient(user, patientId);
      const before = await one('SELECT * FROM patients WHERE id=?', patientId);
      if (user.role === 'PACIENTE') {
        const old = (await one<{
          area: string;
          acs_id: string | null;
        }>('SELECT area,acs_id FROM patients WHERE id=?', patientId))!;
        ensure(
          old.area === data.area && (old.acs_id || null) === (data.acs_id || null),
          'A vinculação de área e ACS deve ser alterada pela equipe.',
          403,
        );
      }
      await run(
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
      await audit(user.id, 'Paciente atualizado', key, { before, after: data });
    } else {
      ensure(user.role !== 'PACIENTE', 'O paciente só pode editar o próprio cadastro.', 403);
      await insertPatient(key, data);
      await audit(user.id, 'Paciente cadastrado', key);
    }
    return { id: key };
  });
}
async function insertPatient(key: string, data: ReturnType<typeof patientSchema.parse>) {
  await run(
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
export async function register(input: unknown) {
  const data = registerSchema.parse(input);
  data.acs_id = null;
  await validatePatient(data);
  return await transaction(async () => {
    const patientId = id(),
      userId = id();
    await insertPatient(patientId, data);
    await run(
      'INSERT INTO users VALUES(?,?,?,?,?,?,?)',
      userId,
      data.name,
      data.email.toLowerCase(),
      hashPassword(data.password),
      'PACIENTE',
      data.area,
      patientId,
    );
    await audit(userId, 'Autocadastro', patientId);
    return userId;
  });
}
export async function recordCondition(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'PROFISSIONAL']);
  const data = input as {
    patient_id: unknown;
    conditions: unknown;
  };
  const key = text.parse(data.patient_id);
  const conditions = text.parse(data.conditions);
  await visiblePatient(user, key);
  return await transaction(async () => {
    const before = await one('SELECT conditions FROM patients WHERE id=?', key);
    await run('UPDATE patients SET conditions=? WHERE id=?', conditions, key);
    await audit(user.id, 'Acompanhamento atualizado', key, { before, conditions });
    return { id: key };
  });
}
