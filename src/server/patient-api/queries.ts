import type { User, Patient } from '@/domain/model';
import { ensure, periodStart, today, dayAfter } from '@/domain/rules';
import { all, one } from '../db';
import { savePatient } from '../modules/patients';
import { z } from 'zod';
import {
  type PageQuery,
  slotQuery,
  ticketsQuery,
  profileOutput,
  profileInput,
  serviceOutput,
  slotOutput,
  ticketOutput,
  vaccinationOutput,
  pendingOutput,
  visitOutput,
} from './contracts';

function patientId(user: User) {
  ensure(user.role === 'PACIENTE' && user.patient_id, 'Acesso exclusivo do paciente.', 403);
  return user.patient_id;
}
async function paged<T extends z.ZodType>(
  sql: string,
  args: (string | number)[],
  query: PageQuery,
  output: T,
) {
  const rows = await all<unknown>(
    `${sql} LIMIT ? OFFSET ?`,
    ...args,
    query.page_size + 1,
    (query.page - 1) * query.page_size,
  );
  return {
    data: rows.slice(0, query.page_size).map((row) => output.parse(row) as z.infer<T>),
    pagination: {
      page: query.page,
      page_size: query.page_size,
      has_more: rows.length > query.page_size,
    },
  };
}
export async function profile(user: User) {
  const row = await one(
    `SELECT p.id,p.name,p.document,p.birth_date,p.phone,p.neighborhood,p.area,u.name acs_name FROM patients p LEFT JOIN users u ON u.id=p.acs_id WHERE p.id=?`,
    patientId(user),
  );
  ensure(row, 'Cadastro não encontrado.', 404);
  return profileOutput.parse(row);
}
export async function updateProfile(user: User, input: unknown) {
  const change = profileInput.parse(input);
  const previous = await one<Patient>('SELECT * FROM patients WHERE id=?', patientId(user));
  ensure(previous, 'Cadastro não encontrado.', 404);
  await savePatient(user, { ...previous, ...change }, previous.id);
  return profile(user);
}
export async function services(query: PageQuery) {
  return paged('SELECT id,name FROM services ORDER BY name,id', [], query, serviceOutput);
}
export async function slots(query: z.infer<typeof slotQuery>) {
  const from = query.date_from || today();
  const to = query.date_to || dayAfter(30);
  ensure(to >= from, 'date_to deve ser igual ou posterior a date_from.');
  const filter = query.service_id ? ' AND s.service_id=?' : '';
  return paged(
    `SELECT s.id,s.service_id,v.name service_name,u.name professional_name,s.date,s.period,s.starts_at,s.capacity,s.capacity-(SELECT COUNT(*) FROM tickets t WHERE t.slot_id=s.id AND t.status!='CANCELADA') available FROM slots s JOIN services v ON v.id=s.service_id JOIN users u ON u.id=s.professional_id WHERE s.date>=? AND s.date<=? AND julianday(s.date || 'T' || s.starts_at || ':00-03:00')>julianday(?) AND (SELECT COUNT(*) FROM tickets t WHERE t.slot_id=s.id AND t.status!='CANCELADA')<s.capacity${filter} ORDER BY s.date,s.starts_at,s.id`,
    [from, to, new Date().toISOString(), ...(query.service_id ? [query.service_id] : [])],
    query,
    slotOutput,
  );
}
const ticketSelect = `SELECT t.id,t.number,t.slot_id,t.status,t.created_at,v.name service_name,u.name professional_name,s.date,s.period,s.starts_at FROM tickets t JOIN slots s ON s.id=t.slot_id JOIN services v ON v.id=s.service_id JOIN users u ON u.id=s.professional_id`;
const ticketRow = ticketOutput.omit({ can_cancel: true }).transform((row) => ({
  ...row,
  can_cancel: row.status === 'RESERVADA' && periodStart(row.date, row.starts_at) > Date.now(),
}));
export async function tickets(user: User, query: z.infer<typeof ticketsQuery>) {
  return paged(
    `${ticketSelect} WHERE t.patient_id=?${query.status ? ' AND t.status=?' : ''} ORDER BY s.date DESC,s.starts_at DESC,t.number DESC`,
    [patientId(user), ...(query.status ? [query.status] : [])],
    query,
    ticketRow,
  );
}
export async function ticket(user: User, id: string) {
  const row = await one(`${ticketSelect} WHERE t.patient_id=? AND t.id=?`, patientId(user), id);
  ensure(row, 'Ficha não encontrada.', 404);
  return ticketRow.parse(row);
}
export async function vaccinations(user: User, query: PageQuery) {
  return paged(
    `SELECT d.id,i.name vaccine_name,d.dose,d.applied_at,l.code lot_code,u.name professional_name,c.name campaign_name FROM doses d JOIN lots l ON l.id=d.lot_id JOIN items i ON i.id=l.item_id JOIN users u ON u.id=d.user_id LEFT JOIN campaigns c ON c.id=d.campaign_id WHERE d.patient_id=? ORDER BY d.applied_at DESC,d.id`,
    [patientId(user)],
    query,
    vaccinationOutput,
  );
}
export async function pendingVaccinations(user: User, query: PageQuery) {
  return paged(
    `SELECT d.id,i.name vaccine_name,d.due_date,d.done FROM pending_doses d JOIN items i ON i.id=d.item_id WHERE d.patient_id=? ORDER BY d.done,d.due_date,d.id`,
    [patientId(user)],
    query,
    pendingOutput.extend({ done: z.number().int().transform(Boolean) }),
  );
}
export async function visits(user: User, query: PageQuery) {
  return paged(
    `SELECT v.id,v.date,v.status,u.name acs_name FROM visits v JOIN users u ON u.id=v.acs_id WHERE v.patient_id=? ORDER BY v.date DESC,v.id`,
    [patientId(user)],
    query,
    visitOutput,
  );
}
