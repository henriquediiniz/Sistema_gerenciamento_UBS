import { z } from 'zod';
import { roles } from './model';
export const text = z.string().trim().min(1, 'Preencha os campos obrigatórios.').max(500);
export const date = z.iso.date('Informe uma data válida.');
const optionalText = z.string().trim().max(1000).default('');
export const patientSchema = z.object({
  name: text.min(3),
  document: text.min(5).max(30),
  birth_date: date,
  phone: z.string().trim().max(30).default(''),
  neighborhood: text,
  area: text,
  acs_id: z.string().nullable().optional(),
});
export const registerSchema = patientSchema.extend({
  email: z.email(),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(128),
});
export const professionalSchema = z.object({
  name: text,
  email: z.email(),
  password: z.string().min(8).max(128),
  role: z.enum(roles).exclude(['PACIENTE']),
  area: optionalText,
});
export const slotSchema = z.object({
  service_id: text,
  professional_id: text,
  date,
  period: z.enum(['Manhã', 'Tarde']),
  starts_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  capacity: z.coerce.number().int().min(1).max(500),
});
export const itemSchema = z.object({
  name: text,
  kind: z.enum(['MEDICAMENTO', 'VACINA']),
  unit: text,
  minimum: z.coerce.number().int().min(0),
  alert_days: z.coerce.number().int().min(0).max(365),
});
export const lotSchema = z.object({
  item_id: text,
  code: text,
  expires_at: date,
  quantity: z.coerce.number().int().min(0).max(1000000),
});
export const movementSchema = z.object({
  lot_id: text,
  kind: z.enum(['ENTRADA', 'SAIDA', 'PERDA', 'AJUSTE']),
  quantity: z.coerce.number().int().min(1).max(1000000),
  direction: z.enum(['MAIS', 'MENOS']).default('MAIS'),
  reason: text.min(3),
});
export const doseSchema = z.object({
  patient_id: text,
  lot_id: text,
  campaign_id: z.string().nullable().optional(),
  dose: z.coerce.number().int().min(1).max(20),
  idempotency_key: z.uuid(),
});
export const campaignSchema = z
  .object({
    name: text,
    item_id: text,
    starts_at: date,
    ends_at: date,
    audience: text,
    required_doses: z.coerce.number().int().min(1).max(20),
    neighborhood: text,
    population: z.coerce.number().int().min(0).max(10000000),
  })
  .refine((v) => v.ends_at >= v.starts_at, 'A data final deve ser posterior à inicial.');
export const visitSchema = z.object({
  patient_id: text,
  acs_id: text,
  date,
  status: z.enum(['PLANEJADA', 'REALIZADA', 'SEM_CONTATO']),
  result: optionalText,
  pending: optionalText,
});
