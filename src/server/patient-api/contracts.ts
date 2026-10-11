import { z } from 'zod';
import { date, patientSchema, registerSchema } from '@/domain/schemas';

export const loginInput = z.strictObject({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export const registerInput = registerSchema.omit({ area: true, acs_id: true }).strict();
export const profileInput = patientSchema
  .omit({ area: true, acs_id: true })
  .extend({ phone: z.string().trim().max(30) })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualizar.');
export const reservationInput = z.strictObject({ slot_id: z.string().min(1).max(500) });
export const emptyInput = z.strictObject({});
export const ticketStatus = z.enum([
  'RESERVADA',
  'AGUARDANDO',
  'EM_ATENDIMENTO',
  'CONCLUIDA',
  'AUSENTE',
  'CANCELADA',
]);
const pageNumber = (fallback: string, max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(max));
export const pageQuery = z.strictObject({
  page: pageNumber('1', 10000),
  page_size: pageNumber('20', 100),
});
export const slotQuery = pageQuery.extend({
  service_id: z.string().min(1).max(500).optional(),
  date_from: date.optional(),
  date_to: date.optional(),
});
export const ticketsQuery = pageQuery.extend({ status: ticketStatus.optional() });
export type PageQuery = z.infer<typeof pageQuery>;

const id = z.string();
const instant = z.iso.datetime();
export const userOutput = z.object({
  id,
  name: z.string(),
  email: z.email(),
  role: z.literal('PACIENTE'),
});
export const profileOutput = z.object({
  id,
  name: z.string(),
  document: z.string(),
  birth_date: date,
  phone: z.string(),
  neighborhood: z.string(),
  area: z.string(),
  acs_name: z.string().nullable(),
});
export const authOutput = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int(),
  expires_at: instant,
  user: userOutput,
});
export const serviceOutput = z.object({ id, name: z.string() });
export const slotOutput = z.object({
  id,
  service_id: id,
  service_name: z.string(),
  professional_name: z.string(),
  date,
  period: z.string(),
  starts_at: z.string(),
  capacity: z.number().int(),
  available: z.number().int(),
});
export const ticketOutput = z.object({
  id,
  number: z.number().int(),
  slot_id: id,
  status: ticketStatus,
  service_name: z.string(),
  professional_name: z.string(),
  date,
  period: z.string(),
  starts_at: z.string(),
  created_at: instant,
  can_cancel: z.boolean(),
});
export const vaccinationOutput = z.object({
  id,
  vaccine_name: z.string(),
  dose: z.number().int(),
  applied_at: instant,
  lot_code: z.string(),
  professional_name: z.string(),
  campaign_name: z.string().nullable(),
});
export const pendingOutput = z.object({
  id,
  vaccine_name: z.string(),
  due_date: date,
  done: z.boolean(),
});
export const visitOutput = z.object({
  id,
  date,
  status: z.enum(['PLANEJADA', 'REALIZADA', 'SEM_CONTATO']),
  acs_name: z.string(),
});
export const paginationOutput = z.object({
  page: z.number().int(),
  page_size: z.number().int(),
  has_more: z.boolean(),
});
export const envelope = <T extends z.ZodType>(item: T) => z.object({ data: item });
export const collection = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), pagination: paginationOutput });
export const errorOutput = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
