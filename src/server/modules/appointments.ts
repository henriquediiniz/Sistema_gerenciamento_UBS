import { z } from 'zod';
import { text } from '@/domain/schemas';
import { ensure, periodStart, today } from '@/domain/rules';
import type { User, Ticket, Slot } from '@/domain/model';
import { audit, id, now, one, run, transaction } from '../db';
import { authorize, visiblePatient } from '../security';
export function reserve(user: User, input: unknown) {
  authorize(user, ['COORDENACAO', 'RECEPCAO', 'PACIENTE']);
  const data = z.object({ patient_id: text, slot_id: text }).parse(input);
  visiblePatient(user, data.patient_id);
  return transaction(() => {
    const slot = one<Slot>('SELECT * FROM slots WHERE id=?', data.slot_id);
    ensure(slot, 'Período não encontrado.', 404);
    ensure(
      periodStart(slot.date, slot.starts_at) > Date.now(),
      'O período já começou. Escolha um período futuro.',
    );
    const count = one<{ count: number }>(
      'SELECT COUNT(*) count FROM tickets WHERE slot_id=? AND status!=?',
      slot.id,
      'CANCELADA',
    )!.count;
    ensure(count < slot.capacity, 'Não há mais vagas neste período.', 409);
    const duplicate = one(
      'SELECT t.id FROM tickets t JOIN slots s ON s.id=t.slot_id WHERE t.patient_id=? AND s.service_id=? AND s.date=? AND t.status NOT IN (?,?)',
      data.patient_id,
      slot.service_id,
      slot.date,
      'CANCELADA',
      'CONCLUIDA',
    );
    ensure(!duplicate, 'O paciente já possui uma ficha ativa para este serviço e data.', 409);
    const key = id();
    run(
      'INSERT INTO tickets(id,patient_id,slot_id,status,priority,created_at) VALUES(?,?,?,?,0,?)',
      key,
      data.patient_id,
      slot.id,
      'RESERVADA',
      now(),
    );
    audit(user.id, 'Ficha emitida', key);
    return { id: key };
  });
}
export function ticketAction(user: User, input: unknown) {
  const data = z
    .object({
      id: text,
      action: z.enum(['cancelar', 'confirmar', 'chamar', 'concluir', 'ausencia', 'retornar']),
      priority: z.coerce.number().int().min(0).max(1).default(0),
    })
    .parse(input);
  return transaction(() => {
    const ticket = one<Ticket & { starts_at: string }>(
      'SELECT t.*,s.date,s.starts_at FROM tickets t JOIN slots s ON s.id=t.slot_id WHERE t.id=?',
      data.id,
    );
    ensure(ticket, 'Ficha não encontrada.', 404);
    visiblePatient(user, ticket.patient_id);
    let status = ticket.status;
    let checked = ticket.checked_in_at;
    let priority = ticket.priority;
    if (data.action === 'cancelar') {
      authorize(user, ['COORDENACAO', 'RECEPCAO', 'PACIENTE']);
      ensure(status === 'RESERVADA', 'Somente fichas reservadas podem ser canceladas.');
      ensure(
        periodStart(ticket.date, ticket.starts_at) > Date.now(),
        'O cancelamento só é permitido antes do início do período.',
      );
      status = 'CANCELADA';
    } else {
      if (['confirmar', 'retornar'].includes(data.action))
        authorize(user, ['COORDENACAO', 'RECEPCAO']);
      else authorize(user, ['COORDENACAO', 'RECEPCAO', 'PROFISSIONAL']);
      ensure(ticket.date === today(), 'A fila é operada somente na data do atendimento.');
      if (data.action === 'confirmar' || data.action === 'retornar') {
        ensure(
          status === (data.action === 'confirmar' ? 'RESERVADA' : 'AUSENTE'),
          'Esta ficha não pode entrar na fila neste estado.',
        );
        status = 'AGUARDANDO';
        checked = now();
        priority = data.priority;
      }
      if (data.action === 'chamar') {
        ensure(status === 'AGUARDANDO', 'O paciente precisa estar na fila.');
        const next = one<{ id: string }>(
          'SELECT id FROM tickets WHERE slot_id=? AND status=? ORDER BY priority DESC,checked_in_at,number LIMIT 1',
          ticket.slot_id,
          'AGUARDANDO',
        );
        ensure(
          next?.id === ticket.id,
          'Chame primeiro o paciente de maior prioridade e ordem de chegada.',
          409,
        );
        ensure(
          !one(
            'SELECT id FROM tickets WHERE slot_id=? AND status=?',
            ticket.slot_id,
            'EM_ATENDIMENTO',
          ),
          'Conclua a ficha em atendimento antes de chamar a próxima.',
          409,
        );
        status = 'EM_ATENDIMENTO';
      }
      if (data.action === 'concluir') {
        ensure(status === 'EM_ATENDIMENTO', 'Chame o paciente antes de concluir.');
        status = 'CONCLUIDA';
      }
      if (data.action === 'ausencia') {
        ensure(status === 'EM_ATENDIMENTO', 'Chame o paciente antes de registrar ausência.');
        status = 'AUSENTE';
      }
    }
    run(
      'UPDATE tickets SET status=?,checked_in_at=?,priority=? WHERE id=?',
      status,
      checked,
      priority,
      ticket.id,
    );
    audit(user.id, `Ficha: ${data.action}`, ticket.id, {
      before: ticket.status,
      status,
      priority,
      checked_in_at: checked,
    });
    return { id: ticket.id };
  });
}
