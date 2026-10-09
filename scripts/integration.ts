import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
const folder = mkdtempSync(join(tmpdir(), 'ubs-integration-'));
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.DATABASE_PATH = join(folder, 'test.sqlite');
if (process.env.TEST_DATABASE_DRIVER === 'libsql')
  process.env.TURSO_DATABASE_URL = `file:${process.env.DATABASE_PATH}`;
const { seed } = await import('../src/server/seed');
const { closeDatabase } = await import('../src/server/db');
const { dayAfter } = await import('../src/domain/rules');
await seed();
closeDatabase();
const port = process.env.TEST_PORT || '3101';
const origin = `http://127.0.0.1:${port}`;
process.env.APP_ORIGIN = origin;
process.env.COOKIE_SECURE = 'false';
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port],
  { env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] },
);
let output = '';
server.stdout.on('data', (b) => (output += b));
server.stderr.on('data', (b) => (output += b));
async function post(resource: string, body: unknown, cookie = '', customOrigin = origin) {
  const response = await fetch(`${origin}/api/${resource}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: customOrigin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get('set-cookie'),
  };
}
async function signin(email: string) {
  const r = await post('login', { email, password: 'Demo@12345' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert(r.cookie?.includes('HttpOnly'));
  assert(r.cookie?.includes('SameSite=lax'));
  return r.cookie!.split(';')[0];
}
async function snap(cookie: string) {
  const response = await fetch(`${origin}/api/snapshot`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return response.json();
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${origin}/login`)).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await pause(100);
  }
  assert(ready, 'Servidor de teste não iniciou.');
  assert.equal((await fetch(`${origin}/api/snapshot`)).status, 401);
  assert.equal(
    (
      await post(
        'login',
        { email: 'coordenacao@ubs.demo', password: 'Demo@12345' },
        '',
        'https://outro.exemplo',
      )
    ).status,
    403,
  );
  assert.equal(
    (await post('login', { email: 'coordenacao@ubs.demo', password: 'senha errada' })).status,
    401,
  );
  const coord = await signin('coordenacao@ubs.demo');
  for (const route of [
    'inicio',
    'pacientes',
    'atendimento',
    'estoque',
    'vacinacao',
    'acompanhamento',
    'relatorios',
    'gestao',
  ]) {
    const response = await fetch(`${origin}/${route}`, { headers: { Cookie: coord } });
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert(!html.includes('Only plain objects'), 'Serialização de registros inválida.');
  }
  const patient = await signin('paciente@ubs.demo');
  const registration = {
    name: 'Paciente Autocadastro HTTP',
    document: 'HTTP-REGISTER-01',
    birth_date: '2000-01-01',
    phone: '',
    neighborhood: 'Centro',
    area: 'Área 01',
    email: 'autocadastro@ubs.demo',
    password: 'Demo@12345',
  };
  const registered = await post('register', registration);
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  assert(registered.cookie?.includes('HttpOnly'));
  const newCookie = registered.cookie!.split(';')[0];
  const newAccount = await snap(newCookie);
  assert.equal(newAccount.patients.length, 1);
  assert.equal(newAccount.patients[0].document, registration.document);
  assert.equal((await post('register', registration)).status, 409);
  assert.equal((await post('logout', {}, newCookie)).status, 200);
  assert.equal(
    (await snap(await signin(registration.email))).patients[0].document,
    registration.document,
  );
  const own = await snap(patient);
  assert.equal(own.patients.length, 1);
  assert.equal(own.patients[0].id, 'p-1');
  assert.equal(
    (
      await post(
        'items',
        { name: 'Item indevido', kind: 'VACINA', unit: 'dose', minimum: 0, alert_days: 0 },
        patient,
      )
    ).status,
    403,
  );
  const redirect = await fetch(`${origin}/gestao`, {
    headers: { Cookie: patient },
    redirect: 'manual',
  });
  assert.equal(redirect.status, 307);
  const acs = await signin('acs@ubs.demo');
  assert((await snap(acs)).patients.every((p: { area: string }) => p.area === 'Área 01'));
  const stockUser = await signin('estoque@ubs.demo');
  assert.equal((await snap(stockUser)).patients.length, 0);
  const slot = await post(
    'slots',
    {
      service_id: 's-3',
      professional_id: 'u-saude2',
      date: dayAfter(7),
      period: 'Tarde',
      starts_at: '13:00',
      capacity: 1,
    },
    coord,
  );
  assert.equal(slot.status, 200);
  const race = await Promise.all(
    ['p-1', 'p-2'].map((patient_id) =>
      post('reservations', { slot_id: slot.body.id, patient_id }, coord),
    ),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const winner = race.find((r) => r.status === 200)!;
  assert.equal(
    (await post('tickets', { id: winner.body.id, action: 'cancelar' }, coord)).status,
    200,
  );
  assert.equal(
    (await post('reservations', { slot_id: slot.body.id, patient_id: 'p-1' }, coord)).status,
    200,
  );
  const before = await snap(coord),
    quantity = before.lots.find((l: { id: string }) => l.id === 'l-3').quantity;
  const dose = {
    patient_id: 'p-5',
    lot_id: 'l-3',
    campaign_id: 'c-1',
    dose: 1,
    idempotency_key: crypto.randomUUID(),
  };
  const repeat = await Promise.all([post('doses', dose, coord), post('doses', dose, coord)]);
  assert(repeat.every((r) => r.status === 200));
  assert.equal(repeat[0].body.id, repeat[1].body.id);
  const after = await snap(coord);
  assert.equal(after.lots.find((l: { id: string }) => l.id === 'l-3').quantity, quantity - 1);
  assert.equal(
    (
      await post(
        'movements',
        { lot_id: 'l-3', kind: 'SAIDA', quantity: 99999, reason: 'Teste de saldo' },
        stockUser,
      )
    ).status,
    409,
  );
  const created = await post(
    'patients',
    {
      name: 'Paciente Integração',
      document: 'HTTP-TEST-01',
      birth_date: '2000-01-01',
      phone: '',
      neighborhood: 'Centro',
      area: 'Área 01',
      acs_id: 'u-acs',
    },
    coord,
  );
  assert.equal(created.status, 200);
  assert.equal(
    (
      await post(
        'patients',
        {
          name: 'Paciente Integração',
          document: 'HTTP-TEST-01',
          birth_date: '2000-01-01',
          phone: '',
          neighborhood: 'Centro',
          area: 'Área 01',
        },
        coord,
      )
    ).status,
    409,
  );
  const persisted = await snap(coord);
  assert(persisted.patients.some((p: { id: string }) => p.id === created.body.id));
  assert.equal((await post('logout', {}, patient)).status, 200);
  assert.equal(
    (await fetch(`${origin}/api/snapshot`, { headers: { Cookie: patient } })).status,
    401,
  );
  console.log(
    'Integração HTTP aprovada: 8 telas, login, autocadastro e novo login, origem, 4 perfis, persistência, capacidade concorrente, idempotência e saldo de estoque.',
  );
} finally {
  server.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once('exit', () => resolve());
  });
  rmSync(folder, { recursive: true, force: true });
}
