import { z } from 'zod';
import { professionalSchema, slotSchema, text } from '@/domain/schemas';
import { ensure, today } from '@/domain/rules';
import type { User } from '@/domain/model';
import { audit, id, one, run, transaction } from '../db';
import { authorize, hashPassword } from '../security';
export function createProfessional(user: User, input: unknown) {
  authorize(user, ['COORDENACAO']);
  const d = professionalSchema.parse(input);
  ensure(d.role !== 'ACS' || d.area, 'Informe a área autorizada do ACS.');
  return transaction(() => {
    const key = id();
    run(
      'INSERT INTO users VALUES(?,?,?,?,?,?,NULL)',
      key,
      d.name,
      d.email.toLowerCase(),
      hashPassword(d.password),
      d.role,
      d.area,
    );
    audit(user.id, 'Profissional cadastrado', key, { role: d.role });
    return { id: key };
  });
}
export function createService(user: User, input: unknown) {
  authorize(user, ['COORDENACAO']);
  const d = z.object({ name: text }).parse(input);
  return transaction(() => {
    const key = id();
    run('INSERT INTO services VALUES(?,?)', key, d.name);
    audit(user.id, 'Serviço cadastrado', key);
    return { id: key };
  });
}
export function createSlot(user: User, input: unknown) {
  authorize(user, ['COORDENACAO']);
  const d = slotSchema.parse(input);
  ensure(d.date >= today(), 'Escolha a data de hoje ou uma data futura.');
  ensure(
    one('SELECT id FROM users WHERE id=? AND role=?', d.professional_id, 'PROFISSIONAL'),
    'Selecione um profissional de saúde.',
  );
  ensure(one('SELECT id FROM services WHERE id=?', d.service_id), 'Serviço não encontrado.');
  return transaction(() => {
    const key = id();
    run(
      'INSERT INTO slots VALUES(?,?,?,?,?,?,?)',
      key,
      d.service_id,
      d.professional_id,
      d.date,
      d.period,
      d.starts_at,
      d.capacity,
    );
    audit(user.id, 'Vagas disponibilizadas', key, d);
    return { id: key };
  });
}
