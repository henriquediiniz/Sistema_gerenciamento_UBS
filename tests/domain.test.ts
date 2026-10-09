import { test, beforeEach, after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.DATABASE_PATH = ':memory:';
const temp =
  process.env.TEST_DATABASE_DRIVER === 'libsql' ? mkdtempSync(join(tmpdir(), 'ubs-libsql-')) : null;
if (temp) process.env.TURSO_DATABASE_URL = `file:${join(temp, 'test.sqlite')}`;
const { executeScript, closeDatabase, one, run, transaction } = await import('../src/server/db');
const { seed } = await import('../src/server/seed');
const { command } = await import('../src/server/commands');
const { snapshot } = await import('../src/server/queries');
const { login, logout, sessionUser, verifyPassword } = await import('../src/server/security');
const { register } = await import('../src/server/modules/patients');
const { today, dayAfter } = await import('../src/domain/rules');
import type { User, Patient } from '../src/domain/model';
const user = async (id: string) =>
  (await one<User>('SELECT id,name,email,role,area,patient_id FROM users WHERE id=?', id))!;
const stock = async (lot = 'l-3') =>
  (await one<{
    quantity: number;
  }>('SELECT quantity FROM lots WHERE id=?', lot))!.quantity;
const count = async (table: string) =>
  (await one<{
    n: number;
  }>(`SELECT COUNT(*) n FROM ${table}`))!.n;
beforeEach(async () => {
  await executeScript('PRAGMA foreign_keys=OFF');
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
    await executeScript(`DELETE FROM ${table}`);
  await executeScript('PRAGMA foreign_keys=ON');
  const original = console.log;
  console.log = () => {};
  try {
    await seed();
  } finally {
    console.log = original;
  }
});
test('senhas são derivadas com salt e login cria sessão revogável', async () => {
  const hash = (await one<{
    password_hash: string;
  }>('SELECT password_hash FROM users WHERE id=?', 'u-coord'))!.password_hash;
  assert.notEqual(hash, 'Demo@12345');
  assert(verifyPassword('Demo@12345', hash));
  await assert.rejects(async () => await login('coordenacao@ubs.demo', 'errada'), /incorretos/);
  const token = await login('COORDENACAO@ubs.demo', 'Demo@12345');
  assert.equal((await sessionUser(token))?.role, 'COORDENACAO');
  await logout(token);
  assert.equal(await sessionUser(token), undefined);
});
test('tentativas de login são limitadas', async () => {
  for (let i = 0; i < 10; i++)
    await assert.rejects(async () => await login('coordenacao@ubs.demo', 'errada'), /incorretos/);
  await assert.rejects(
    async () => await login('coordenacao@ubs.demo', 'Demo@12345'),
    /Muitas tentativas/,
  );
});
test('paciente vê somente seus registros e não recebe credenciais internas', async () => {
  const s = await snapshot(await user('u-paciente'));
  assert.equal(s.patients.length, 1);
  assert(s.tickets.every((t) => t.patient_id === 'p-1'));
  assert(s.doses.every((t) => t.patient_id === 'p-1'));
  assert(s.visits.every((t) => t.patient_id === 'p-1'));
  assert.equal(s.professionals.length, 0);
  assert.equal(s.audit.length, 0);
  assert(!JSON.stringify(s).includes('password_hash'));
});
test('ACS só enxerga pacientes e visitas de sua área', async () => {
  const s = await snapshot(await user('u-acs'));
  assert(s.patients.every((p) => p.area === 'Área 01'));
  assert(!s.visits.some((v) => v.patient_id === 'p-3'));
  assert.equal(s.doses.length, 0);
  assert.equal(s.lots.length, 0);
});
test('estoque não recebe pacientes nem registros clínicos', async () => {
  const s = await snapshot(await user('u-estoque'));
  assert.equal(s.patients.length, 0);
  assert.equal(s.doses.length, 0);
  assert.equal(s.visits.length, 0);
  assert(s.lots.length > 0);
});
test('reserva respeita capacidade e cancelamento libera vaga', async () => {
  await run('UPDATE slots SET capacity=1 WHERE id=?', 'slot-1-2');
  const r = await command('reservations', await user('u-recep'), {
    patient_id: 'p-1',
    slot_id: 'slot-1-2',
  });
  await assert.rejects(
    async () =>
      await command('reservations', await user('u-recep'), {
        patient_id: 'p-2',
        slot_id: 'slot-1-2',
      }),
    /mais vagas/,
  );
  await command('tickets', await user('u-paciente'), { id: r.id, action: 'cancelar' });
  await command('reservations', await user('u-recep'), { patient_id: 'p-2', slot_id: 'slot-1-2' });
});
test('duplicidade por serviço e data é impedida mesmo em outro período', async () => {
  await run(
    'INSERT INTO slots VALUES(?,?,?,?,?,?,?)',
    'slot-alt',
    's-1',
    'u-saude2',
    dayAfter(1),
    'Tarde',
    '13:00',
    10,
  );
  await assert.rejects(
    async () =>
      await command('reservations', await user('u-recep'), {
        patient_id: 'p-3',
        slot_id: 'slot-alt',
      }),
    /ficha ativa/,
  );
});
test('paciente não pode reservar para outra pessoa', async () => {
  await assert.rejects(
    async () =>
      await command('reservations', await user('u-paciente'), {
        patient_id: 'p-2',
        slot_id: 'slot-1-1',
      }),
    /próprio cadastro/,
  );
});
test('cancelamento após início é rejeitado', async () => {
  await run('UPDATE slots SET date=? WHERE id=?', dayAfter(-1), 'slot-0-1');
  await assert.rejects(
    async () => await command('tickets', await user('u-recep'), { id: 't-3', action: 'cancelar' }),
    /antes do início/,
  );
});
test('confirmação de presença valida prioridade e transição de estado', async () => {
  await command('tickets', await user('u-recep'), { id: 't-3', action: 'confirmar', priority: 1 });
  assert.equal(
    (
      await one<{
        status: string;
      }>('SELECT status FROM tickets WHERE id=?', 't-3')
    )?.status,
    'AGUARDANDO',
  );
  await assert.rejects(
    async () => await command('tickets', await user('u-recep'), { id: 't-3', action: 'confirmar' }),
    /neste estado/,
  );
  await assert.rejects(
    async () =>
      await command('tickets', await user('u-paciente'), { id: 't-1', action: 'concluir' }),
    /permissão/,
  );
});
test('chamada respeita prioridade, chegada e um atendimento por período', async () => {
  await assert.rejects(
    async () => await command('tickets', await user('u-saude'), { id: 't-4', action: 'chamar' }),
    /primeiro/,
  );
  await assert.rejects(
    async () => await command('tickets', await user('u-saude'), { id: 't-1', action: 'chamar' }),
    /Conclua/,
  );
  await command('tickets', await user('u-saude'), { id: 't-2', action: 'concluir' });
  await command('tickets', await user('u-saude'), { id: 't-1', action: 'chamar' });
  assert.equal(
    (
      await one<{
        status: string;
      }>('SELECT status FROM tickets WHERE id=?', 't-1')
    )?.status,
    'EM_ATENDIMENTO',
  );
});
test('retorno de ausente recebe novo instante de chegada', async () => {
  const old = (await one<{
    checked_in_at: string;
  }>('SELECT checked_in_at FROM tickets WHERE id=?', 't-7'))!.checked_in_at;
  await command('tickets', await user('u-recep'), { id: 't-7', action: 'retornar' });
  assert.notEqual(
    (await one<{
      checked_in_at: string;
    }>('SELECT checked_in_at FROM tickets WHERE id=?', 't-7'))!.checked_in_at,
    old,
  );
});
test('saída não produz estoque negativo e não deixa movimentação parcial', async () => {
  const before = await count('movements');
  await assert.rejects(
    async () =>
      await command('movements', await user('u-estoque'), {
        lot_id: 'l-2',
        kind: 'SAIDA',
        quantity: 1000,
        reason: 'Teste de limite',
      }),
    /Saldo insuficiente/,
  );
  assert.equal(await stock('l-2'), 42);
  assert.equal(await count('movements'), before);
});
test('lotes vencidos e bloqueados não podem sair para uso', async () => {
  await assert.rejects(
    async () =>
      await command('movements', await user('u-estoque'), {
        lot_id: 'l-5',
        kind: 'SAIDA',
        quantity: 1,
        reason: 'Saída teste',
      }),
    /vencidos/,
  );
  await command('lot-status', await user('u-estoque'), {
    id: 'l-3',
    blocked: true,
    reason: 'Conferência do lote',
  });
  await assert.rejects(
    async () =>
      await command('doses', await user('u-saude'), {
        patient_id: 'p-5',
        lot_id: 'l-3',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /bloqueado/,
  );
});
test('perda exige motivo e permite descarte de lote vencido', async () => {
  await assert.rejects(
    async () =>
      await command('movements', await user('u-estoque'), {
        lot_id: 'l-5',
        kind: 'PERDA',
        quantity: 1,
        reason: '',
      }),
  );
  await command('movements', await user('u-estoque'), {
    lot_id: 'l-5',
    kind: 'PERDA',
    quantity: 25,
    reason: 'Descarte por vencimento',
  });
  assert.equal(await stock('l-5'), 0);
});
test('aplicação, estoque e histórico são atômicos e reenvio é idempotente', async () => {
  const before = await stock(),
    history = await count('doses');
  const payload = {
    patient_id: 'p-5',
    lot_id: 'l-3',
    dose: 1,
    campaign_id: 'c-1',
    idempotency_key: crypto.randomUUID(),
  };
  const first = await command('doses', await user('u-saude'), payload);
  const repeated = await command('doses', await user('u-saude'), payload);
  assert.equal(first.id, repeated.id);
  assert.equal(await stock(), before - 1);
  assert.equal(await count('doses'), history + 1);
  await assert.rejects(
    async () => await command('doses', await user('u-saude'), { ...payload, patient_id: 'p-6' }),
    /outra aplicação/,
  );
});
test('dose repetida na campanha não é contada nem debitada novamente', async () => {
  const before = await stock();
  await assert.rejects(
    async () =>
      await command('doses', await user('u-saude'), {
        patient_id: 'p-1',
        lot_id: 'l-3',
        campaign_id: 'c-1',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /UNIQUE/,
  );
  assert.equal(await stock(), before);
});
test('cobertura conta pessoas únicas e exige todas as doses da campanha', async () => {
  await run('UPDATE campaigns SET required_doses=2 WHERE id=?', 'c-1');
  assert((await snapshot(await user('u-coord'))).coverage.every((c) => c.people === 0));
  await command('doses', await user('u-saude'), {
    patient_id: 'p-1',
    lot_id: 'l-3',
    campaign_id: 'c-1',
    dose: 2,
    idempotency_key: crypto.randomUUID(),
  });
  assert.equal(
    (await snapshot(await user('u-coord'))).coverage.find((c) => c.neighborhood === 'Centro')
      ?.people,
    1,
  );
  await command('targets', await user('u-coord'), {
    campaign_id: 'c-1',
    neighborhood: 'Centro',
    population: 0,
  });
  assert.equal(
    (await snapshot(await user('u-coord'))).coverage.find((c) => c.neighborhood === 'Centro')
      ?.population,
    0,
  );
});
test('campanha exige vacina correspondente e período vigente', async () => {
  await assert.rejects(
    async () =>
      await command('doses', await user('u-saude'), {
        patient_id: 'p-5',
        lot_id: 'l-4',
        campaign_id: 'c-1',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /corresponder/,
  );
  await run('UPDATE campaigns SET ends_at=? WHERE id=?', dayAfter(-1), 'c-1');
  await assert.rejects(
    async () =>
      await command('doses', await user('u-saude'), {
        patient_id: 'p-5',
        lot_id: 'l-3',
        campaign_id: 'c-1',
        dose: 1,
        idempotency_key: crypto.randomUUID(),
      }),
    /vigência/,
  );
});
test('ACS não diagnostica nem registra visitas fora da área', async () => {
  await assert.rejects(
    async () =>
      await command('conditions', await user('u-acs'), {
        patient_id: 'p-1',
        conditions: 'Diagnóstico',
      }),
    /permissão/,
  );
  await assert.rejects(
    async () =>
      await command('visits', await user('u-acs'), {
        patient_id: 'p-3',
        acs_id: 'u-acs',
        date: today(),
        status: 'REALIZADA',
        result: 'Contato realizado',
      }),
    /área/,
  );
});
test('visita sem contato permanece distinta de realizada e histórico de correção é auditado', async () => {
  await command('visits', await user('u-acs'), {
    id: 'v-1',
    patient_id: 'p-1',
    acs_id: 'u-acs',
    date: today(),
    status: 'SEM_CONTATO',
    result: 'Sem contato no endereço',
    pending: 'Reagendar',
  });
  const s = await snapshot(await user('u-coord'));
  assert.equal(s.visits.filter((v) => v.status === 'REALIZADA').length, 1);
  assert(
    await one('SELECT id FROM audit WHERE action=? AND entity_id=?', 'Visita atualizada', 'v-1'),
  );
});
test('visita futura não pode ser registrada como realizada', async () => {
  await assert.rejects(
    async () =>
      await command('visits', await user('u-acs'), {
        patient_id: 'p-1',
        acs_id: 'u-acs',
        date: dayAfter(1),
        status: 'REALIZADA',
        result: 'Visita feita',
      }),
    /data futura/,
  );
});
test('paciente edita contato, mas não muda área ou ACS por conta própria', async () => {
  const p = (await one<Patient>('SELECT * FROM patients WHERE id=?', 'p-1'))!;
  await command('patients', await user('u-paciente'), { ...p, phone: '(83) 99999-0000' });
  await assert.rejects(
    async () =>
      await command('patients', await user('u-paciente'), {
        ...p,
        area: 'Área 02',
        acs_id: 'u-acs2',
      }),
    /vinculação/,
  );
});
test('autocadastro cria paciente e conta atomicamente e impede duplicidade', async () => {
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
  const key = await register(payload);
  assert.equal((await user(key)).role, 'PACIENTE');
  const before = await count('patients');
  await assert.rejects(async () => await register({ ...payload, document: 'OUTRO-123' }), /UNIQUE/);
  assert.equal(await count('patients'), before);
});
test('cadastro único e permissão de gestão são obrigatórios', async () => {
  const p = (await one<Patient>('SELECT * FROM patients WHERE id=?', 'p-1'))!;
  await assert.rejects(
    async () => await command('patients', await user('u-recep'), { ...p, id: undefined }),
    /UNIQUE/,
  );
  await assert.rejects(
    async () =>
      await command('professionals', await user('u-recep'), {
        name: 'Usuário',
        email: 'x@y.com',
        password: '12345678',
        role: 'COORDENACAO',
      }),
    /permissão/,
  );
});
test('estoque mínimo considera apenas saldo utilizável', async () => {
  await run('UPDATE lots SET blocked=1 WHERE id=?', 'l-1');
  const s = await snapshot(await user('u-estoque'));
  assert.equal(s.items.find((i) => i.id === 'i-1')?.usable, 0);
  assert.equal(s.items.find((i) => i.id === 'i-5')?.usable, 0);
});

after(() => {
  closeDatabase();
  if (temp) rmSync(temp, { recursive: true, force: true });
});

test('operações simultâneas não compartilham uma transação nem desfazem a escrita de outra requisição', async () => {
  let wrote!: () => void;
  const started = new Promise<void>((resolve) => {
    wrote = resolve;
  });
  const rollingBack = transaction(async () => {
    await run('UPDATE patients SET phone=? WHERE id=?', 'temporário', 'p-1');
    wrote();
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new Error('rollback esperado');
  });
  const rejection = assert.rejects(rollingBack, /rollback esperado/);
  await started;
  const independent = run('UPDATE patients SET phone=? WHERE id=?', 'confirmado', 'p-2');
  await Promise.all([rejection, independent]);
  assert.notEqual(
    (await one<{ phone: string }>('SELECT phone FROM patients WHERE id=?', 'p-1'))?.phone,
    'temporário',
  );
  assert.equal(
    (await one<{ phone: string }>('SELECT phone FROM patients WHERE id=?', 'p-2'))?.phone,
    'confirmado',
  );
});
test('duas reservas simultâneas disputam uma única vaga sem exceder a capacidade', async () => {
  await run('UPDATE slots SET capacity=1 WHERE id=?', 'slot-1-2');
  const actor = await user('u-recep');
  const result = await Promise.allSettled(
    ['p-1', 'p-2'].map((patient_id) =>
      command('reservations', actor, { slot_id: 'slot-1-2', patient_id }),
    ),
  );
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  const failure = result.find((r) => r.status === 'rejected');
  assert.match(failure?.status === 'rejected' ? String(failure.reason) : '', /mais vagas/);
});
test('banco preserva integridade referencial no adaptador selecionado', async () => {
  await assert.rejects(
    () =>
      run(
        'INSERT INTO sessions VALUES(?,?,?)',
        'fake-session',
        'nonexistent-user',
        new Date().toISOString(),
      ),
    /FOREIGN KEY/,
  );
});
test('seed repetido não sobrescreve cadastros existentes', async () => {
  await run('UPDATE users SET name=? WHERE id=?', 'Nome preservado', 'u-coord');
  const total = await count('users');
  await seed();
  assert.equal(await count('users'), total);
  assert.equal((await user('u-coord')).name, 'Nome preservado');
});
