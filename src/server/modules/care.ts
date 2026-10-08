import { z } from 'zod';
import { doseSchema, campaignSchema, visitSchema, date, text } from '@/domain/schemas';
import { ensure, today } from '@/domain/rules';
import type { User, Lot, Campaign, Visit } from '@/domain/model';
import { audit, id, now, one, run, transaction } from '../db';
import { authorize, visiblePatient } from '../security';
export function createCampaign(user: User, input: unknown) {
  authorize(user, ['COORDENACAO']);
  const d = campaignSchema.parse(input);
  return transaction(() => {
    ensure(
      one('SELECT id FROM items WHERE id=? AND kind=?', d.item_id, 'VACINA'),
      'Selecione uma vacina.',
    );
    const key = id();
    run(
      'INSERT INTO campaigns VALUES(?,?,?,?,?,?,?)',
      key,
      d.name,
      d.item_id,
      d.starts_at,
      d.ends_at,
      d.audience,
      d.required_doses,
    );
    run('INSERT INTO campaign_targets VALUES(?,?,?)', key, d.neighborhood, d.population);
    audit(user.id, 'Campanha cadastrada', key);
    return { id: key };
  });
}
export function saveTarget(user: User, input: unknown) {
  authorize(user, ['COORDENACAO']);
  const d = z
    .object({
      campaign_id: text,
      neighborhood: text,
      population: z.coerce.number().int().min(0).max(10000000),
    })
    .parse(input);
  return transaction(() => {
    ensure(one('SELECT id FROM campaigns WHERE id=?', d.campaign_id), 'Campanha não encontrada.');
    run(
      'INSERT INTO campaign_targets VALUES(?,?,?) ON CONFLICT(campaign_id,neighborhood) DO UPDATE SET population=excluded.population',
      d.campaign_id,
      d.neighborhood,
      d.population,
    );
    audit(user.id, 'População de referência atualizada', d.campaign_id, d);
    return { id: d.campaign_id };
  });
}
export function applyDose(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'PROFISSIONAL']);
  const d = doseSchema.parse(input);
  visiblePatient(user, d.patient_id);
  return transaction(() => {
    const prior = one<{
      id: string;
      patient_id: string;
      lot_id: string;
      campaign_id: string | null;
      dose: number;
    }>('SELECT * FROM doses WHERE idempotency_key=?', d.idempotency_key);
    if (prior) {
      ensure(
        prior.patient_id === d.patient_id &&
          prior.lot_id === d.lot_id &&
          prior.dose === d.dose &&
          prior.campaign_id === (d.campaign_id || null),
        'A chave de reenvio já foi usada em outra aplicação.',
        409,
      );
      return { id: prior.id, replayed: true };
    }
    const lot = one<Lot>(
      'SELECT l.*,i.kind FROM lots l JOIN items i ON i.id=l.item_id WHERE l.id=?',
      d.lot_id,
    );
    ensure(lot && lot.kind === 'VACINA', 'Selecione um lote de vacina.');
    ensure(!lot.blocked && lot.expires_at >= today(), 'O lote está vencido ou bloqueado.');
    ensure(lot.quantity > 0, 'O lote não possui doses disponíveis.', 409);
    if (d.campaign_id) {
      const c = one<Campaign>('SELECT * FROM campaigns WHERE id=?', d.campaign_id);
      ensure(c && c.item_id === lot.item_id, 'A vacina deve corresponder à campanha.');
      ensure(c.starts_at <= today() && c.ends_at >= today(), 'A campanha não está em vigência.');
      ensure(d.dose <= c.required_doses, 'Dose fora do critério desta campanha.');
    }
    const key = id();
    run(
      'INSERT INTO doses VALUES(?,?,?,?,?,?,?,?)',
      key,
      d.patient_id,
      lot.id,
      d.campaign_id || null,
      d.dose,
      now(),
      user.id,
      d.idempotency_key,
    );
    run('UPDATE lots SET quantity=quantity-1 WHERE id=?', lot.id);
    run(
      'INSERT INTO movements VALUES(?,?,?,?,?,?)',
      id(),
      lot.id,
      -1,
      `Aplicação de vacina ${key}`,
      user.id,
      now(),
    );
    audit(user.id, 'Dose aplicada', key, { patient_id: d.patient_id, lot_id: lot.id });
    return { id: key, replayed: false };
  });
}
export function planDose(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'PROFISSIONAL']);
  const d = z.object({ patient_id: text, item_id: text, due_date: date, note: text }).parse(input);
  visiblePatient(user, d.patient_id);
  ensure(
    one('SELECT id FROM items WHERE id=? AND kind=?', d.item_id, 'VACINA'),
    'Selecione uma vacina.',
  );
  return transaction(() => {
    const key = id();
    run(
      'INSERT INTO pending_doses VALUES(?,?,?,?,?,0)',
      key,
      d.patient_id,
      d.item_id,
      d.due_date,
      d.note,
    );
    audit(user.id, 'Dose prevista registrada', key);
    return { id: key };
  });
}
export function closePendingDose(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'PROFISSIONAL']);
  const d = z.object({ id: text }).parse(input);
  return transaction(() => {
    ensure(one('SELECT id FROM pending_doses WHERE id=?', d.id), 'Pendência não encontrada.', 404);
    run('UPDATE pending_doses SET done=1 WHERE id=?', d.id);
    audit(user.id, 'Pendência vacinal encerrada', d.id);
    return { id: d.id };
  });
}
export function saveVisit(user: User, input: unknown, visitId?: string) {
  authorize(user, ['COORDENACAO', 'ACS']);
  const d = visitSchema.parse(input);
  const patient = visiblePatient(user, d.patient_id);
  const acs = one<User>('SELECT * FROM users WHERE id=? AND role=?', d.acs_id, 'ACS');
  ensure(acs && acs.area === patient.area, 'O ACS deve pertencer à área do paciente.');
  if (user.role === 'ACS')
    ensure(d.acs_id === user.id, 'Registre visitas somente em seu nome.', 403);
  if (d.status !== 'PLANEJADA') {
    ensure(d.result.trim(), 'Descreva o resultado da visita.');
    ensure(d.date <= today(), 'Uma visita realizada não pode ter data futura.');
  }
  return transaction(() => {
    const key = visitId || id();
    if (visitId) {
      const old = one<Visit>('SELECT * FROM visits WHERE id=?', key);
      ensure(old, 'Visita não encontrada.', 404);
      visiblePatient(user, old.patient_id);
      if (user.role === 'ACS')
        ensure(old.acs_id === user.id, 'Esta visita pertence a outro ACS.', 403);
      run(
        'UPDATE visits SET patient_id=?,acs_id=?,date=?,status=?,result=?,pending=? WHERE id=?',
        d.patient_id,
        d.acs_id,
        d.date,
        d.status,
        d.result,
        d.pending,
        key,
      );
      audit(user.id, 'Visita atualizada', key, { before: old, after: d });
    } else {
      run(
        'INSERT INTO visits VALUES(?,?,?,?,?,?,?)',
        key,
        d.patient_id,
        d.acs_id,
        d.date,
        d.status,
        d.result,
        d.pending,
      );
      audit(user.id, 'Visita registrada', key, d);
    }
    return { id: key };
  });
}
