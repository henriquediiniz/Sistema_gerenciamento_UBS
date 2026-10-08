import type { Snapshot, Patient, Visit } from '@/domain/model';
import { roleLabels } from '@/domain/model';
import type { Field, FormSpec } from './ui';
const options = (rows: { id: string; name: string }[]) =>
  rows.map((x) => ({ value: x.id, label: x.name }));
const field = (name: string, label: string, rest: Partial<Field> = {}): Field => ({
  name,
  label,
  ...rest,
});
export function forms(d: Snapshot) {
  const patients = options(d.patients),
    acs = options(d.professionals.filter((p) => p.role === 'ACS')),
    vaccines = options(d.items.filter((i) => i.kind === 'VACINA'));
  const selectPatient = field('patient_id', 'Paciente', {
    options: patients,
    value: d.user.patient_id || undefined,
    wide: true,
  });
  return {
    patient: (p?: Patient): FormSpec => ({
      title: p ? 'Editar paciente' : 'Cadastrar paciente',
      resource: 'patients',
      fields: [
        field('name', 'Nome completo', { value: p?.name, wide: true }),
        field('document', 'Documento / identificador', { value: p?.document }),
        field('birth_date', 'Data de nascimento', { type: 'date', value: p?.birth_date }),
        field('phone', 'Telefone', { value: p?.phone, required: false }),
        field('neighborhood', 'Bairro', { value: p?.neighborhood }),
        ...(d.user.role === 'PACIENTE'
          ? []
          : [
              field('area', 'Área', { value: p?.area || 'Área 01' }),
              field('acs_id', 'ACS responsável', {
                options: acs,
                value: p?.acs_id || '',
                required: false,
              }),
            ]),
      ],
      extra: {
        ...(p ? { id: p.id } : {}),
        ...(d.user.role === 'PACIENTE' ? { area: p?.area, acs_id: p?.acs_id } : {}),
      },
    }),
    reservation: (): FormSpec => ({
      title: 'Emitir ficha de atendimento',
      description:
        'A ficha reserva uma vaga no período. Ela não garante um horário exato. Confirme a presença na recepção ao chegar.',
      resource: 'reservations',
      fields: [
        selectPatient,
        field('slot_id', 'Serviço, data e período', {
          wide: true,
          options: d.slots
            .filter(
              (s) =>
                s.reserved < s.capacity &&
                new Date(`${s.date}T${s.starts_at}:00-03:00`).getTime() > Date.now(),
            )
            .map((s) => ({
              value: s.id,
              label: `${s.service_name} · ${s.date.split('-').reverse().join('/')} · ${s.period} · ${s.capacity - s.reserved} vagas`,
            })),
        }),
      ],
    }),
    checkin: (id: string, returning = false): FormSpec => ({
      title: returning ? 'Registrar retorno' : 'Confirmar presença',
      description:
        'A prioridade deve ser validada pela equipe. O retorno recebe uma nova posição por ordem de chegada dentro da sua prioridade.',
      resource: 'tickets',
      fields: [
        field('priority', 'Prioridade validada', {
          options: [
            { value: '0', label: 'Atendimento regular' },
            { value: '1', label: 'Atendimento prioritário' },
          ],
          value: '0',
          wide: true,
        }),
      ],
      extra: { id, action: returning ? 'retornar' : 'confirmar' },
    }),
    item: (): FormSpec => ({
      title: 'Cadastrar item',
      resource: 'items',
      fields: [
        field('name', 'Nome do item', { wide: true }),
        field('kind', 'Tipo', {
          options: [
            { value: 'MEDICAMENTO', label: 'Medicamento' },
            { value: 'VACINA', label: 'Vacina' },
          ],
        }),
        field('unit', 'Unidade de controle', { value: 'unidades' }),
        field('minimum', 'Estoque mínimo', { type: 'number', min: 0, value: 20 }),
        field('alert_days', 'Alertar validade em (dias)', {
          type: 'number',
          min: 0,
          max: 365,
          value: 30,
        }),
      ],
    }),
    lot: (): FormSpec => ({
      title: 'Cadastrar lote',
      resource: 'lots',
      fields: [
        field('item_id', 'Item', { options: options(d.items), wide: true }),
        field('code', 'Código do lote'),
        field('expires_at', 'Validade', { type: 'date' }),
        field('quantity', 'Saldo inicial', { type: 'number', min: 0, value: 0 }),
      ],
    }),
    movement: (): FormSpec => ({
      title: 'Movimentar estoque',
      resource: 'movements',
      description:
        'Saídas para uso exigem lote válido e disponível. Perdas e ajustes ficam registrados com motivo e responsável.',
      fields: [
        field('lot_id', 'Item e lote', {
          options: d.lots.map((l) => ({
            value: l.id,
            label: `${l.item_name} · ${l.code} · saldo ${l.quantity}`,
          })),
          wide: true,
        }),
        field('kind', 'Movimentação', {
          options: [
            { value: 'ENTRADA', label: 'Entrada' },
            { value: 'SAIDA', label: 'Saída para uso' },
            { value: 'PERDA', label: 'Perda / descarte' },
            { value: 'AJUSTE', label: 'Ajuste de saldo' },
          ],
        }),
        field('quantity', 'Quantidade', { type: 'number', min: 1, value: 1 }),
        field('direction', 'Direção (somente para ajustes)', {
          options: [
            { value: 'MAIS', label: 'Acrescentar' },
            { value: 'MENOS', label: 'Retirar' },
          ],
          value: 'MAIS',
          wide: true,
        }),
        field('reason', 'Motivo', { type: 'textarea', wide: true }),
      ],
    }),
    block: (id: string, blocked: boolean): FormSpec => ({
      title: blocked ? 'Bloquear lote' : 'Desbloquear lote',
      resource: 'lot-status',
      fields: [field('reason', 'Motivo', { type: 'textarea', wide: true })],
      extra: { id, blocked },
    }),
    dose: (): FormSpec => ({
      title: 'Registrar aplicação',
      description:
        'A confirmação registra a dose e retira uma unidade do lote. A avaliação do público-alvo é responsabilidade do profissional.',
      resource: 'doses',
      submitLabel: 'Confirmar aplicação',
      fields: [
        selectPatient,
        field('lot_id', 'Vacina e lote', {
          options: d.lots
            .filter(
              (l) => l.kind === 'VACINA' && !l.blocked && l.expires_at >= d.today && l.quantity > 0,
            )
            .map((l) => ({
              value: l.id,
              label: `${l.item_name} · ${l.code} · ${l.quantity} doses`,
            })),
          wide: true,
        }),
        field('dose', 'Número da dose', { type: 'number', min: 1, max: 20, value: 1 }),
        field('campaign_id', 'Campanha (opcional)', {
          options: options(
            d.campaigns.filter((c) => c.starts_at <= d.today && c.ends_at >= d.today),
          ),
          required: false,
        }),
      ],
      extra: { idempotency_key: crypto.randomUUID() },
    }),
    campaign: (): FormSpec => ({
      title: 'Cadastrar campanha',
      description:
        'O protótipo considera completo quem recebeu as doses numeradas de 1 até o total exigido dentro desta campanha.',
      resource: 'campaigns',
      fields: [
        field('name', 'Nome da campanha', { wide: true }),
        field('item_id', 'Vacina', { options: vaccines, wide: true }),
        field('starts_at', 'Início', { type: 'date', value: d.today }),
        field('ends_at', 'Fim', { type: 'date' }),
        field('audience', 'Público-alvo', { wide: true }),
        field('required_doses', 'Doses exigidas', { type: 'number', min: 1, max: 20, value: 1 }),
        field('neighborhood', 'Bairro de referência'),
        field('population', 'População-alvo do bairro', { type: 'number', min: 0, value: 0 }),
      ],
    }),
    target: (): FormSpec => ({
      title: 'População de referência',
      resource: 'targets',
      description:
        'Cadastre cada bairro da campanha. Com população zero, a cobertura fica sem percentual.',
      fields: [
        field('campaign_id', 'Campanha', { options: options(d.campaigns), wide: true }),
        field('neighborhood', 'Bairro'),
        field('population', 'População-alvo', { type: 'number', min: 0, value: 0 }),
      ],
    }),
    pending: (): FormSpec => ({
      title: 'Registrar dose prevista',
      resource: 'pending-doses',
      fields: [
        selectPatient,
        field('item_id', 'Vacina', { options: vaccines }),
        field('due_date', 'Data prevista', { type: 'date' }),
        field('note', 'Orientação do profissional', { type: 'textarea', wide: true }),
      ],
    }),
    condition: (p?: Patient): FormSpec => ({
      title: 'Condição de acompanhamento',
      resource: 'conditions',
      description:
        'Registro destinado ao profissional autorizado. Não há sugestão automática de diagnóstico.',
      fields: [
        { ...selectPatient, value: p?.id },
        field('conditions', 'Condições e observações', {
          type: 'textarea',
          value: p?.conditions,
          wide: true,
        }),
      ],
    }),
    visit: (v?: Visit): FormSpec => ({
      title: v ? 'Atualizar visita' : 'Planejar ou registrar visita',
      resource: 'visits',
      fields: [
        { ...selectPatient, value: v?.patient_id },
        field('acs_id', 'ACS responsável', {
          options: acs,
          value: v?.acs_id || (d.user.role === 'ACS' ? d.user.id : undefined),
        }),
        field('date', 'Data da visita', { type: 'date', value: v?.date || d.today }),
        field('status', 'Situação', {
          options: [
            { value: 'PLANEJADA', label: 'Planejada' },
            { value: 'REALIZADA', label: 'Realizada' },
            { value: 'SEM_CONTATO', label: 'Tentativa sem contato' },
          ],
          value: v?.status || 'PLANEJADA',
          wide: true,
        }),
        field('result', 'Resultado (obrigatório após a tentativa)', {
          type: 'textarea',
          value: v?.result,
          required: false,
          wide: true,
        }),
        field('pending', 'Pendências e próximo passo', {
          type: 'textarea',
          value: v?.pending,
          required: false,
          wide: true,
        }),
      ],
      extra: v ? { id: v.id } : {},
    }),
    professional: (): FormSpec => ({
      title: 'Cadastrar profissional',
      resource: 'professionals',
      fields: [
        field('name', 'Nome completo', { wide: true }),
        field('email', 'E-mail de acesso', { type: 'email' }),
        field('password', 'Senha inicial (8+ caracteres)', { type: 'password' }),
        field('role', 'Perfil de acesso', {
          options: Object.entries(roleLabels)
            .filter(([key]) => key !== 'PACIENTE')
            .map(([value, label]) => ({ value, label })),
        }),
        field('area', 'Área autorizada (obrigatória para ACS)', { required: false }),
      ],
    }),
    service: (): FormSpec => ({
      title: 'Cadastrar serviço',
      resource: 'services',
      fields: [field('name', 'Nome do serviço', { wide: true })],
    }),
    slot: (): FormSpec => ({
      title: 'Disponibilizar vagas',
      resource: 'slots',
      fields: [
        field('service_id', 'Serviço', { options: options(d.services) }),
        field('professional_id', 'Profissional', {
          options: options(d.professionals.filter((p) => p.role === 'PROFISSIONAL')),
        }),
        field('date', 'Data', { type: 'date', value: d.today }),
        field('period', 'Período', {
          options: [
            { value: 'Manhã', label: 'Manhã' },
            { value: 'Tarde', label: 'Tarde' },
          ],
        }),
        field('starts_at', 'Início do período', { type: 'time', value: '08:00' }),
        field('capacity', 'Quantidade de vagas', { type: 'number', min: 1, max: 500, value: 12 }),
      ],
    }),
  };
}
