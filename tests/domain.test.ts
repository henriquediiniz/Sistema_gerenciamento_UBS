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
const { executeScript, closeDatabase, all, one, run, transaction } =
  await import('../src/server/db');
const { seed } = await import('../src/server/seed');
const { command } = await import('../src/server/commands');
const { snapshot } = await import('../src/server/queries');
const { login, logout, sessionUser, verifyPassword } = await import('../src/server/security');
const { register } = await import('../src/server/modules/patients');
const { reserve } = await import('../src/server/modules/appointments');
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
    'reservation_requests',
    'patient_sessions',
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

const { patientApi } = await import('../src/server/patient-api/handler');
const { schemas: apiSchemas, openApiDocument } = await import('../src/server/patient-api/openapi');
const { createHash } = await import('node:crypto');
async function mobile(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
    raw?: string;
  } = {},
) {
  const headers = {
    ...(options.body !== undefined || options.raw !== undefined
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  };
  const request = new Request(`http://127.0.0.1:3000/api/v1/${path}`, {
    method: options.method || 'GET',
    headers,
    ...(options.body !== undefined || options.raw !== undefined
      ? { body: options.raw ?? JSON.stringify(options.body) }
      : {}),
  });
  const response = await patientApi(request, path.split('?')[0].split('/'));
  return {
    status: response.status,
    headers: response.headers,
    body: response.status === 204 ? null : await response.json(),
  };
}
async function mobileLogin() {
  const response = await mobile('auth/login', {
    method: 'POST',
    body: { email: 'paciente@ubs.demo', password: 'Demo@12345' },
  });
  assert.equal(response.status, 200);
  apiSchemas.AuthResponse.parse(response.body);
  return response.body.data.access_token as string;
}
test('API móvel: login aceita apenas paciente, token fica como hash e expiração é aplicada', async () => {
  const denied = await mobile('auth/login', {
    method: 'POST',
    body: { email: 'coordenacao@ubs.demo', password: 'Demo@12345' },
  });
  assert.equal(denied.status, 403);
  assert.equal(await count('patient_sessions'), 0);
  const token = await mobileLogin();
  const stored = await one<{ token_hash: string }>('SELECT token_hash FROM patient_sessions');
  assert.equal(stored?.token_hash, createHash('sha256').update(token).digest('hex'));
  assert.equal((await mobile('me', { token })).status, 200);
  await run('UPDATE patient_sessions SET expires_at=?', new Date(0).toISOString());
  const expired = await mobile('me', { token });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, 'UNAUTHORIZED');
  assert.match(expired.headers.get('www-authenticate')!, /Bearer/);
});
test('API móvel: sessões de cookie e Bearer são independentes e logout é revogável', async () => {
  const webToken = await login('paciente@ubs.demo', 'Demo@12345');
  assert.equal(
    (await mobile('me', { headers: { Cookie: `ubs_session=${webToken}` } })).status,
    401,
  );
  assert.equal((await mobile('me', { token: webToken })).status, 401);
  const token = await mobileLogin();
  assert.equal(await sessionUser(token), undefined);
  assert.equal((await mobile('auth/logout', { token, method: 'POST', body: {} })).status, 204);
  assert.equal((await mobile('me', { token })).status, 401);
  assert.equal((await mobile('auth/logout', { token, method: 'POST', body: {} })).status, 204);
  assert.equal((await sessionUser(webToken))?.id, 'u-paciente');
});
test('API móvel: autocadastro não permite escolher papel, área ou vínculo de outra pessoa', async () => {
  const input = {
    name: 'Paciente Aplicativo',
    document: 'APP-CADASTRO',
    birth_date: '2000-01-01',
    neighborhood: 'Centro',
    email: 'app@ubs.demo',
    password: 'Senha@1234',
  };
  assert.equal(
    (await mobile('auth/register', { method: 'POST', body: { ...input, role: 'COORDENACAO' } }))
      .status,
    400,
  );
  assert.equal(
    (await mobile('auth/register', { method: 'POST', body: { ...input, area: 'Área 01' } })).status,
    400,
  );
  const result = await mobile('auth/register', { method: 'POST', body: input });
  assert.equal(result.status, 201);
  apiSchemas.RegistrationResponse.parse(result.body);
  const created = await user(result.body.data.id);
  assert.equal(created.role, 'PACIENTE');
  assert.equal(created.area, 'A definir');
  assert.equal((await mobile('auth/register', { method: 'POST', body: input })).status, 409);
  assert.equal(
    (
      await mobile('auth/login', {
        method: 'POST',
        body: { email: input.email, password: input.password },
      })
    ).status,
    200,
  );
});
test('API móvel: edição parcial preserva vínculo territorial, sincroniza nome e rejeita campos extras', async () => {
  const token = await mobileLogin();
  for (const body of [
    { area: 'Área 02' },
    { acs_id: 'u-acs2' },
    { patient_id: 'p-2' },
    { role: 'COORDENACAO' },
    { conditions: 'Livre' },
    {},
  ]) {
    assert.equal((await mobile('me', { token, method: 'PATCH', body })).status, 400);
  }
  const response = await mobile('me', {
    token,
    method: 'PATCH',
    body: { name: 'Maria Atualizada', phone: '123456789' },
  });
  assert.equal(response.status, 200);
  apiSchemas.MeResponse.parse(response.body);
  assert.equal(response.body.data.user.name, 'Maria Atualizada');
  assert.equal(response.body.data.patient.area, 'Área 01');
  assert.equal((await user('u-paciente')).name, 'Maria Atualizada');
  const nameOnly = await mobile('me', { token, method: 'PATCH', body: { name: 'Maria Outra' } });
  assert.equal(nameOnly.body.data.patient.phone, '123456789');
  assert.equal(
    (await one<Patient>('SELECT * FROM patients WHERE id=?', 'p-2'))?.phone === '123456789',
    false,
  );
});
test('API móvel: consultas privadas omitem anotações internas e registros de outros pacientes', async () => {
  const token = await mobileLogin();
  const paths = ['tickets', 'me/vaccinations', 'me/pending-vaccinations', 'me/visits'];
  for (const path of paths) {
    const response = await mobile(path, { token });
    assert.equal(response.status, 200, path);
    const text = JSON.stringify(response.body);
    for (const field of [
      'password_hash',
      'token_hash',
      'patient_id',
      'conditions',
      'result',
      'pending',
      'note',
      'user_id',
    ])
      assert(!text.includes(`"${field}"`), `${path}: ${field}`);
    assert.equal((await mobile(`${path}?patient_id=p-2`, { token })).status, 400);
  }
  const doses = await mobile('me/vaccinations', { token });
  apiSchemas.VaccinationsResponse.parse(doses.body);
  const expected = await all<{ id: string }>('SELECT id FROM doses WHERE patient_id=?', 'p-1');
  assert.deepEqual(
    doses.body.data.map((r: { id: string }) => r.id).sort(),
    expected.map((r) => r.id).sort(),
  );
  apiSchemas.PendingVaccinationsResponse.parse(
    (await mobile('me/pending-vaccinations', { token })).body,
  );
  apiSchemas.VisitsResponse.parse((await mobile('me/visits', { token })).body);
  assert.equal((await mobile('tickets/t-2', { token })).status, 404);
  assert.equal(
    (await mobile('tickets/t-2/cancel', { token, method: 'POST', body: {} })).status,
    404,
  );
  assert.equal((await mobile('tickets/inexistente', { token })).status, 404);
});
test('API móvel: paginação é limitada, filtros são validados e vagas iniciadas/lotadas ficam ocultas', async () => {
  const token = await mobileLogin();
  await run('UPDATE slots SET capacity=1 WHERE id=?', 'slot-1-1');
  const response = await mobile(
    `slots?date_from=${dayAfter(1)}&date_to=${dayAfter(1)}&page_size=1`,
    { token },
  );
  assert.equal(response.status, 200);
  apiSchemas.SlotsResponse.parse(response.body);
  assert.equal(response.body.data.length, 1);
  assert(
    response.body.data.every(
      (s: { id: string; available: number; date: string }) =>
        s.id !== 'slot-1-1' && s.available > 0 && s.date === dayAfter(1),
    ),
  );
  const first = await mobile('services?page_size=1', { token });
  const second = await mobile('services?page_size=1&page=2', { token });
  assert(first.body.pagination.has_more);
  assert.notEqual(first.body.data[0].id, second.body.data[0].id);
  for (const query of [
    'page=0',
    'page=1&page=2',
    'page_size=101',
    'page_size=1.5',
    'other=1',
    'date_from=2026-02-30',
    'date_from=2026-02-02&date_to=2026-02-01',
  ]) {
    assert.equal((await mobile(`slots?${query}`, { token })).status, 400, query);
  }
});
test('API móvel: reenvios concorrentes da reserva retornam uma ficha e conflito de chave não grava', async () => {
  const token = await mobileLogin();
  const key = crypto.randomUUID();
  const request = {
    token,
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: { slot_id: 'slot-1-2' },
  };
  const before = await count('tickets');
  const responses = await Promise.all([
    mobile('reservations', request),
    mobile('reservations', request),
  ]);
  assert(responses.every((r) => r.status === 201));
  assert.equal(responses[0].body.data.id, responses[1].body.data.id);
  assert.equal(await count('tickets'), before + 1);
  apiSchemas.TicketResponse.parse(responses[0].body);
  assert.equal(
    (await mobile('reservations', { ...request, body: { slot_id: 'slot-2-2' } })).status,
    409,
  );
  assert.equal(
    (await mobile('reservations', { ...request, body: { slot_id: 'slot-1-2', patient_id: 'p-2' } }))
      .status,
    400,
  );
  assert.equal((await mobile('reservations', { ...request, headers: {} })).status, 400);
  const id = responses[0].body.data.id;
  assert.equal(
    (await mobile(`tickets/${id}/cancel`, { token, method: 'POST', body: {} })).body.data.status,
    'CANCELADA',
  );
  assert.equal(
    (await mobile(`tickets/${id}/cancel`, { token, method: 'POST', body: {} })).status,
    200,
  );
  assert.equal((await mobile('reservations', request)).body.data.status, 'CANCELADA');
  assert.equal(await count('tickets'), before + 1);
});
test('API móvel: cancelamento continua respeitando horário e fluxo da equipe', async () => {
  const token = await mobileLogin();
  const reserved = await reserve(await user('u-paciente'), {
    patient_id: 'p-1',
    slot_id: 'slot-1-2',
  });
  await run('UPDATE slots SET date=? WHERE id=?', dayAfter(-1), 'slot-1-2');
  const response = await mobile(`tickets/${reserved.id}/cancel`, {
    token,
    method: 'POST',
    body: {},
  });
  assert.equal(response.status, 400);
  assert.equal((await mobile(`tickets/${reserved.id}`, { token })).body.data.can_cancel, false);
  assert.equal(
    (await mobile('tickets/t-1/cancel', { token, method: 'POST', body: {} })).status,
    400,
  );
});
test('API móvel: erros HTTP consistentes, sem cache, sem cookies ou CORS permissivo', async () => {
  const token = await mobileLogin();
  const invalidJson = await mobile('auth/login', { method: 'POST', raw: '{invalid' });
  assert.equal(invalidJson.status, 400);
  apiSchemas.ErrorResponse.parse(invalidJson.body);
  assert.equal(
    (
      await mobile('auth/login', {
        method: 'POST',
        raw: '{}',
        headers: { 'Content-Type': 'text/plain' },
      })
    ).status,
    415,
  );
  assert.equal(
    (await mobile('auth/login', { method: 'POST', raw: 'x'.repeat(65537) })).status,
    413,
  );
  assert.equal(
    (await mobile('me', { token, headers: { Origin: 'https://evil.example' } })).status,
    403,
  );
  const method = await mobile('me', { token, method: 'DELETE' });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET, PATCH');
  assert.equal((await mobile('inventory', { token })).status, 404);
  const result = await mobile('me', { token });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('set-cookie'), null);
  assert.equal(result.headers.get('access-control-allow-origin'), null);
});
test('API móvel: limite de login é compartilhado com o site', async () => {
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await mobile('auth/login', {
          method: 'POST',
          body: { email: 'paciente@ubs.demo', password: 'errada' },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await mobile('auth/login', {
        method: 'POST',
        body: { email: 'paciente@ubs.demo', password: 'Demo@12345' },
      })
    ).status,
    429,
  );
  await assert.rejects(() => login('paciente@ubs.demo', 'Demo@12345'), /Muitas tentativas/);
});
test('API móvel: OpenAPI público usa Bearer e descreve todas as operações', async () => {
  const result = await mobile('openapi.json');
  assert.equal(result.status, 200);
  const spec = openApiDocument();
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.components.securitySchemes.patientBearer.scheme, 'bearer');
  assert.equal(
    Object.values(spec.paths).reduce((sum, path) => sum + Object.keys(path).length, 0),
    14,
  );
  assert(!JSON.stringify(spec).includes('TURSO_AUTH_TOKEN='));
});
