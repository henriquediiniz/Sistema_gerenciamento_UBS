export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function ensure(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new DomainError(message, status);
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function dayAfter(days: number) {
  const d = new Date(`${today()}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function periodStart(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).getTime();
}
export const statusLabels: Record<string, string> = {
  RESERVADA: 'Reservada',
  AGUARDANDO: 'Na fila',
  EM_ATENDIMENTO: 'Em atendimento',
  CONCLUIDA: 'Concluída',
  AUSENTE: 'Ausente',
  CANCELADA: 'Cancelada',
  PLANEJADA: 'Planejada',
  REALIZADA: 'Realizada',
  SEM_CONTATO: 'Sem contato',
};
