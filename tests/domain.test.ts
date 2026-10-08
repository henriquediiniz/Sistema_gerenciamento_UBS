import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_PATH = ':memory:';
const { database, one, run } = await import('../src/server/db');
const { seed } = await import('../src/server/seed');
const { command } = await import('../src/server/commands');
const { snapshot } = await import('../src/server/queries');
const { login, logout, sessionUser, verifyPassword } = await import('../src/server/security');
const { register } = await import('../src/server/modules/patients');
const { today, dayAfter } = await import('../src/domain/rules');
import type { User, Patient } from '../src/domain/model';
const user = (id: string) =>
  one<User>('SELECT id,name,email,role,area,patient_id FROM users WHERE id=?', id)!;
const stock = (lot = 'l-3') =>
  one<{ quantity: number }>('SELECT quantity FROM lots WHERE id=?', lot)!.quantity;
const count = (table: string) => one<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`)!.n;
beforeEach(() => {
  const db = database();
  db.exec('PRAGMA foreign_keys=OFF');
  for (const table of [
    'audit',
    'visits',
    'pending_doses',
    'doses',
    'campaign_targets',
    'campaigns',
    'movements',
    'lots',
    'items',
    'tickets',
    'slots',
    'services',
    'sessions',
    'login_attempts',
    'patients',
    'users',
  ])
    db.exec(`DELETE FROM ${table}`);
  db.exec('PRAGMA foreign_keys=ON');
  const original = console.log;
  console.log = () => {};
  try {
    seed();
  } finally {
    console.log = original;
  }
});
test('senhas são derivadas com salt e login cria sessão revogável', () => {
  const hash = one<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id=?',
    'u-coord',
  )!.password_hash;
  assert.notEqual(hash, 'Demo@12345');
  assert(verifyPassword('Demo@12345', hash));
  assert.throws(() => login('coordenacao@ubs.demo', 'errada'), /incorretos/);
  const token = login('COORDENACAO@ubs.demo', 'Demo@12345');
  assert.equal(sessionUser(token)?.role, 'COORDENACAO');
  logout(token);
  assert.equal(sessionUser(token), undefined);
});
test('tentativas de login são limitadas', () => {
  for (let i = 0; i < 10; i++)
    assert.throws(() => login('coordenacao@ubs.demo', 'errada'), /incorretos/);
  assert.throws(() => login('coordenacao@ubs.demo', 'Demo@12345'), /Muitas tentativas/);
});
test('paciente vê somente seus registros e não recebe credenciais internas', () => {
  const s = snapshot(user('u-paciente'));
  assert.equal(s.patients.length, 1);
  assert(s.tickets.every((t) => t.patient_id === 'p-1'));
  assert(s.doses.every((t) => t.patient_id === 'p-1'));
  assert(s.visits.every((t) => t.patient_id === 'p-1'));
  assert.equal(s.professionals.length, 0);
  assert.equal(s.audit.length, 0);
  assert(!JSON.stringify(s).includes('password_hash'));
});
test('ACS só enxerga pacientes e visitas de sua área', () => {
  const s = snapshot(user('u-acs'));
  assert(s.patients.every((p) => p.area === 'Área 01'));
  assert(!s.visits.some((v) => v.patient_id === 'p-3'));
  assert.equal(s.doses.length, 0);
  assert.equal(s.lots.length, 0);
});
test('estoque não recebe pacientes nem registros clínicos', () => {
  const s = snapshot(user('u-estoque'));
  assert.equal(s.patients.length, 0);
  assert.equal(s.doses.length, 0);
  assert.equal(s.visits.length, 0);
  assert(s.lots.length > 0);
});
test('reserva respeita capacidade e cancelamento libera vaga', () => {
  run('UPDATE slots SET capacity=1 WHERE id=?', 'slot-1-2');
  const r = command('reservations', user('u-recep'), { patient_id: 'p-1', slot_id: 'slot-1-2' });
  assert.throws(
    () => command('reservations', user('u-recep'), { patient_id: 'p-2', slot_id: 'slot-1-2' }),
    /mais vagas/,
  );
  command('tickets', user('u-paciente'), { id: r.id, action: 'cancelar' });
  command('reservations', user('u-recep'), { patient_id: 'p-2', slot_id: 'slot-1-2' });
});
test('duplicidade por serviço e data é impedida mesmo em outro período', () => {
  run(
    'INSERT INTO slots VALUES(?,?,?,?,?,?,?)',
    'slot-alt',
    's-1',
    'u-saude2',
    dayAfter(1),
    'Tarde',
    '13:00',
    10,
  );
  assert.throws(
    () => command('reservations', user('u-recep'), { patient_id: 'p-3', slot_id: 'slot-alt' }),
    /ficha ativa/,
  );
});
test('paciente não pode reservar para outra pessoa', () => {
  assert.throws(
    () => command('reservations', user('u-paciente'), { patient_id: 'p-2', slot_id: 'slot-1-1' }),
    /próprio cadastro/,
  );
});
test('cancelamento após início é rejeitado', () => {
  run('UPDATE slots SET date=? WHERE id=?', dayAfter(-1), 'slot-0-1');
  assert.throws(
    () => command('tickets', user('u-recep'), { id: 't-3', action: 'cancelar' }),
    /antes do início/,
  );
});
test('confirmação de presença valida prioridade e transição de estado', () => {
  command('tickets', user('u-recep'), { id: 't-3', action: 'confirmar', priority: 1 });
  assert.equal(
    one<{ status: string }>('SELECT status FROM tickets WHERE id=?', 't-3')?.status,
    'AGUARDANDO',
  );
  assert.throws(
    () => command('tickets', user('u-recep'), { id: 't-3', action: 'confirmar' }),
    /neste estado/,
  );
  assert.throws(
    () => command('tickets', user('u-paciente'), { id: 't-1', action: 'concluir' }),
    /permissão/,
  );
});
test('chamada respeita prioridade, chegada e um atendimento por período', () => {
  assert.throws(
    () => command('tickets', user('u-saude'), { id: 't-4', action: 'chamar' }),
    /primeiro/,
  );
  assert.throws(
    () => command('tickets', user('u-saude'), { id: 't-1', action: 'chamar' }),
    /Conclua/,
  );
  command('tickets', user('u-saude'), { id: 't-2', action: 'concluir' });
  command('tickets', user('u-saude'), { id: 't-1', action: 'chamar' });
  assert.equal(
    one<{ status: string }>('SELECT status FROM tickets WHERE id=?', 't-1')?.status,
    'EM_ATENDIMENTO',
  );
});
test('retorno de ausente recebe novo instante de chegada', () => {
  const old = one<{ checked_in_at: string }>(
    'SELECT checked_in_at FROM tickets WHERE id=?',
    't-7',
  )!.checked_in_at;
  command('tickets', user('u-recep'), { id: 't-7', action: 'retornar' });
  assert.notEqual(
    one<{ checked_in_at: string }>('SELECT checked_in_at FROM tickets WHERE id=?', 't-7')!
      .checked_in_at,
    old,
  );
});
test('saída não produz estoque negativo e não deixa movimentação parcial', () => {
  const before = count('movements');
  assert.throws(
    () =>
      command('movements', user('u-estoque'), {
        lot_id: 'l-2',
        kind: 'SAIDA',
        quantity: 1000,
        reason: 'Teste de limite',
      }),
    /Saldo insuficiente/,
  );
  assert.equal(stock('l-2'), 42);
  assert.equal(count('movements'), before);
});
test('lotes vencidos e bloqueados não podem sair para uso', () => {
  assert.throws(
    () =>
      command('movements', user('u-estoque'), {
        lot_id: 'l-5',
        kind: 'SAIDA',
        quantity: 1,
        reason: 'Saída teste',
      }),
    /vencidos/,
  );
  command('lot-status', user('u-estoque'), {
    id: 'l-3',
    blocked: true,
    reason: 'Conferência do lote',
  });
  assert.throws(
    () =>
      command('doses', user('u-saude'), {
        patient_id: 'p-5',
        lot_id: 'l-3',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /bloqueado/,
  );
});
test('perda exige motivo e permite descarte de lote vencido', () => {
  assert.throws(() =>
    command('movements', user('u-estoque'), {
      lot_id: 'l-5',
      kind: 'PERDA',
      quantity: 1,
      reason: '',
    }),
  );
  command('movements', user('u-estoque'), {
    lot_id: 'l-5',
    kind: 'PERDA',
    quantity: 25,
    reason: 'Descarte por vencimento',
  });
  assert.equal(stock('l-5'), 0);
});
test('aplicação, estoque e histórico são atômicos e reenvio é idempotente', () => {
  const before = stock(),
    history = count('doses');
  const payload = {
    patient_id: 'p-5',
    lot_id: 'l-3',
    dose: 1,
    campaign_id: 'c-1',
    idempotency_key: crypto.randomUUID(),
  };
  const first = command('doses', user('u-saude'), payload);
  const repeated = command('doses', user('u-saude'), payload);
  assert.equal(first.id, repeated.id);
  assert.equal(stock(), before - 1);
  assert.equal(count('doses'), history + 1);
  assert.throws(
    () => command('doses', user('u-saude'), { ...payload, patient_id: 'p-6' }),
    /outra aplicação/,
  );
});
test('dose repetida na campanha não é contada nem debitada novamente', () => {
  const before = stock();
  assert.throws(
    () =>
      command('doses', user('u-saude'), {
        patient_id: 'p-1',
        lot_id: 'l-3',
        campaign_id: 'c-1',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /UNIQUE/,
  );
  assert.equal(stock(), before);
});
test('cobertura conta pessoas únicas e exige todas as doses da campanha', () => {
  run('UPDATE campaigns SET required_doses=2 WHERE id=?', 'c-1');
  assert(snapshot(user('u-coord')).coverage.every((c) => c.people === 0));
  command('doses', user('u-saude'), {
    patient_id: 'p-1',
    lot_id: 'l-3',
    campaign_id: 'c-1',
    dose: 2,
    idempotency_key: crypto.randomUUID(),
  });
  assert.equal(
    snapshot(user('u-coord')).coverage.find((c) => c.neighborhood === 'Centro')?.people,
    1,
  );
  command('targets', user('u-coord'), {
    campaign_id: 'c-1',
    neighborhood: 'Centro',
    population: 0,
  });
  assert.equal(
    snapshot(user('u-coord')).coverage.find((c) => c.neighborhood === 'Centro')?.population,
    0,
  );
});
test('campanha exige vacina correspondente e período vigente', () => {
  assert.throws(
    () =>
      command('doses', user('u-saude'), {
        patient_id: 'p-5',
        lot_id: 'l-4',
        campaign_id: 'c-1',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /corresponder/,
  );
  run('UPDATE campaigns SET ends_at=? WHERE id=?', dayAfter(-1), 'c-1');
  assert.throws(
    () =>
      command('doses', user('u-saude'), {
        patient_id: 'p-5',
        lot_id: 'l-3',
        campaign_id: 'c-1',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /vigência/,
  );
});
test('ACS não diagnostica nem registra visitas fora da área', () => {
  assert.throws(
    () => command('conditions', user('u-acs'), { patient_id: 'p-1', conditions: 'Diagnóstico' }),
    /permissão/,
  );
  assert.throws(
    () =>
      command('visits', user('u-acs'), {
        patient_id: 'p-3',
        acs_id: 'u-acs',
        date: today(),
        status: 'REALIZADA',
        result: 'Contato realizado',
      }),
    /área/,
  );
});
test('visita sem contato permanece distinta de realizada e histórico de correção é auditado', () => {
  command('visits', user('u-acs'), {
    id: 'v-1',
    patient_id: 'p-1',
    acs_id: 'u-acs',
    date: today(),
    status: 'SEM_CONTATO',
    result: 'Sem contato no endereço',
    pending: 'Reagendar',
  });
  const s = snapshot(user('u-coord'));
  assert.equal(s.visits.filter((v) => v.status === 'REALIZADA').length, 1);
  assert(one('SELECT id FROM audit WHERE action=? AND entity_id=?', 'Visita atualizada', 'v-1'));
});
test('visita futura não pode ser registrada como realizada', () => {
  assert.throws(
    () =>
      command('visits', user('u-acs'), {
        patient_id: 'p-1',
        acs_id: 'u-acs',
        date: dayAfter(1),
        status: 'REALIZADA',
        result: 'Visita feita',
      }),
    /data futura/,
  );
});
test('paciente edita contato, mas não muda área ou ACS por conta própria', () => {
  const p = one<Patient>('SELECT * FROM patients WHERE id=?', 'p-1')!;
  command('patients', user('u-paciente'), { ...p, phone: '(83) 99999-0000' });
  assert.throws(
    () => command('patients', user('u-paciente'), { ...p, area: 'Área 02', acs_id: 'u-acs2' }),
    /vinculação/,
  );
});
test('autocadastro cria paciente e conta atomicamente e impede duplicidade', () => {
  const payload = {
    name: 'Pessoa de teste',
    document: 'TESTE-123',
    birth_date: '2000-01-01',
    phone: '',
    neighborhood: 'Centro',
    area: 'Área 01',
    email: 'teste@ubs.demo',
    password: 'Senha@1234',
  };
  const key = register(payload);
  assert.equal(user(key).role, 'PACIENTE');
  const before = count('patients');
  assert.throws(() => register({ ...payload, document: 'OUTRO-123' }), /UNIQUE/);
  assert.equal(count('patients'), before);
});
test('cadastro único e permissão de gestão são obrigatórios', () => {
  const p = one<Patient>('SELECT * FROM patients WHERE id=?', 'p-1')!;
  assert.throws(() => command('patients', user('u-recep'), { ...p, id: undefined }), /UNIQUE/);
  assert.throws(
    () =>
      command('professionals', user('u-recep'), {
        name: 'Usuário',
        email: 'x@y.com',
        password: '12345678',
        role: 'COORDENACAO',
      }),
    /permissão/,
  );
});
test('estoque mínimo considera apenas saldo utilizável', () => {
  run('UPDATE lots SET blocked=1 WHERE id=?', 'l-1');
  const s = snapshot(user('u-estoque'));
  assert.equal(s.items.find((i) => i.id === 'i-1')?.usable, 0);
  assert.equal(s.items.find((i) => i.id === 'i-5')?.usable, 0);
});
