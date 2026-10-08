export const roles = [
  'COORDENACAO',
  'RECEPCAO',
  'PROFISSIONAL',
  'ESTOQUE',
  'ACS',
  'PACIENTE',
] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  COORDENACAO: 'Coordenação',
  RECEPCAO: 'Recepção',
  PROFISSIONAL: 'Profissional de saúde',
  ESTOQUE: 'Estoque',
  ACS: 'Agente comunitário',
  PACIENTE: 'Paciente',
};
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  area: string;
  patient_id: string | null;
}
export interface Patient {
  id: string;
  name: string;
  document: string;
  birth_date: string;
  phone: string;
  neighborhood: string;
  area: string;
  acs_id: string | null;
  conditions: string;
  created_at: string;
}
export interface Service {
  id: string;
  name: string;
}
export interface Slot {
  id: string;
  service_id: string;
  professional_id: string;
  date: string;
  period: string;
  starts_at: string;
  capacity: number;
  service_name: string;
  professional_name: string;
  reserved: number;
}
export type TicketStatus =
  'RESERVADA' | 'AGUARDANDO' | 'EM_ATENDIMENTO' | 'CONCLUIDA' | 'AUSENTE' | 'CANCELADA';
export interface Ticket {
  id: string;
  number: number;
  patient_id: string;
  slot_id: string;
  status: TicketStatus;
  priority: number;
  checked_in_at: string | null;
  created_at: string;
  patient_name: string;
  service_name: string;
  date: string;
  period: string;
}
export interface Item {
  id: string;
  name: string;
  kind: 'MEDICAMENTO' | 'VACINA';
  unit: string;
  minimum: number;
  alert_days: number;
  usable: number;
}
export interface Lot {
  id: string;
  item_id: string;
  code: string;
  expires_at: string;
  quantity: number;
  blocked: number;
  item_name: string;
  kind: string;
  unit: string;
  alert_days: number;
}
export interface Movement {
  id: string;
  lot_id: string;
  delta: number;
  reason: string;
  user_id: string;
  created_at: string;
  item_name: string;
  lot_code: string;
  user_name: string;
}
export interface Campaign {
  id: string;
  name: string;
  item_id: string;
  starts_at: string;
  ends_at: string;
  audience: string;
  required_doses: number;
  item_name: string;
}
export interface Coverage {
  campaign_id: string;
  neighborhood: string;
  population: number;
  people: number;
}
export interface Dose {
  id: string;
  patient_id: string;
  lot_id: string;
  campaign_id: string | null;
  dose: number;
  applied_at: string;
  user_id: string;
  patient_name: string;
  item_name: string;
  lot_code: string;
  user_name: string;
}
export interface PendingDose {
  id: string;
  patient_id: string;
  item_id: string;
  due_date: string;
  note: string;
  done: number;
  patient_name: string;
  item_name: string;
}
export interface Visit {
  id: string;
  patient_id: string;
  acs_id: string;
  date: string;
  status: 'PLANEJADA' | 'REALIZADA' | 'SEM_CONTATO';
  result: string;
  pending: string;
  patient_name: string;
  acs_name: string;
}
export interface Audit {
  id: string;
  action: string;
  entity_id: string;
  user_name: string;
  created_at: string;
}
export interface Snapshot {
  user: User;
  today: string;
  patients: Patient[];
  professionals: User[];
  services: Service[];
  slots: Slot[];
  tickets: Ticket[];
  items: Item[];
  lots: Lot[];
  movements: Movement[];
  campaigns: Campaign[];
  coverage: Coverage[];
  doses: Dose[];
  pendingDoses: PendingDose[];
  visits: Visit[];
  audit: Audit[];
}
export const sections = [
  'inicio',
  'pacientes',
  'atendimento',
  'estoque',
  'vacinacao',
  'acompanhamento',
  'relatorios',
  'gestao',
] as const;
export type Section = (typeof sections)[number];
export const sectionLabels: Record<Section, string> = {
  inicio: 'Visão geral',
  pacientes: 'Pacientes',
  atendimento: 'Fichas e fila',
  estoque: 'Estoque',
  vacinacao: 'Vacinação',
  acompanhamento: 'Acompanhamento',
  relatorios: 'Relatórios',
  gestao: 'Gestão da unidade',
};
export const access: Record<Section, readonly Role[]> = {
  inicio: roles,
  pacientes: ['COORDENACAO', 'RECEPCAO', 'PROFISSIONAL', 'ACS', 'PACIENTE'],
  atendimento: ['COORDENACAO', 'RECEPCAO', 'PROFISSIONAL', 'PACIENTE'],
  estoque: ['COORDENACAO', 'ESTOQUE'],
  vacinacao: ['COORDENACAO', 'PROFISSIONAL', 'PACIENTE'],
  acompanhamento: ['COORDENACAO', 'PROFISSIONAL', 'ACS', 'PACIENTE'],
  relatorios: ['COORDENACAO'],
  gestao: ['COORDENACAO'],
};
