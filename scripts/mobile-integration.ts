import assert from 'node:assert/strict';
import { schemas } from '../src/server/patient-api/openapi';

// Runs only against the temporary server created by integration.ts.
export async function mobileIntegration(origin: string, webCookie: string) {
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
    extra: Record<string, string> = {},
  ) {
    const result = await fetch(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: result.status,
      headers: result.headers,
      body: result.status === 204 ? null : await result.json(),
    };
  }
  const input = {
    name: 'Paciente Mobile HTTP',
    document: 'MOBILE-HTTP-01',
    birth_date: '2001-01-01',
    neighborhood: 'Centro',
    email: 'mobile-http@ubs.demo',
    password: 'Demo@12345',
  };
  assert.equal((await request('auth/register', 'POST', input)).status, 201);
  const logged = await request('auth/login', 'POST', {
    email: input.email,
    password: input.password,
  });
  assert.equal(logged.status, 200);
  schemas.AuthResponse.parse(logged.body);
  const token = logged.body.data.access_token as string;
  assert.equal(logged.headers.get('set-cookie'), null);
  assert.equal(logged.headers.get('cache-control'), 'no-store');
  const profile = await request('me', 'GET', undefined, token);
  schemas.MeResponse.parse(profile.body);
  assert.equal(profile.body.data.patient.document, input.document);
  assert.equal(
    (await request('me', 'GET', undefined, undefined, { Cookie: webCookie })).status,
    401,
  );
  assert.equal(
    (await request('me', 'GET', undefined, token, { Origin: 'https://outro.example' })).status,
    403,
  );
  assert.equal((await request('me', 'PATCH', { phone: '11999990000' }, token)).status, 200);
  assert.equal((await request('services?page_size=1', 'GET', undefined, token)).status, 200);
  const slots = await request('slots?page_size=100', 'GET', undefined, token);
  schemas.SlotsResponse.parse(slots.body);
  assert(slots.body.data.length > 0);
  const reserveBody = { slot_id: slots.body.data[0].id };
  const headers = { 'Idempotency-Key': crypto.randomUUID() };
  const race = await Promise.all([
    request('reservations', 'POST', reserveBody, token, headers),
    request('reservations', 'POST', reserveBody, token, headers),
  ]);
  assert.deepEqual(
    race.map((r) => r.status),
    [201, 201],
  );
  assert.equal(race[0].body.data.id, race[1].body.data.id);
  const id = race[0].body.data.id;
  schemas.TicketResponse.parse(race[0].body);
  // A web session must see the reservation made through the mobile API.
  const webSnapshot = await fetch(`${origin}/api/snapshot`, { headers: { Cookie: webCookie } });
  assert((await webSnapshot.json()).tickets.some((ticket: { id: string }) => ticket.id === id));
  assert.equal((await request(`tickets/${id}`, 'GET', undefined, token)).status, 200);
  const cancellations = await Promise.all([
    request(`tickets/${id}/cancel`, 'POST', {}, token),
    request(`tickets/${id}/cancel`, 'POST', {}, token),
  ]);
  assert(cancellations.every((r) => r.status === 200 && r.body.data.status === 'CANCELADA'));
  assert.equal((await request('tickets/t-1', 'GET', undefined, token)).status, 404);
  schemas.TicketsResponse.parse((await request('tickets', 'GET', undefined, token)).body);
  for (const [path, schema] of [
    ['me/vaccinations', schemas.VaccinationsResponse],
    ['me/pending-vaccinations', schemas.PendingVaccinationsResponse],
    ['me/visits', schemas.VisitsResponse],
  ] as const) {
    const result = await request(path, 'GET', undefined, token);
    assert.equal(result.status, 200);
    schema.parse(result.body);
    assert.deepEqual(result.body.data, []);
  }
  const contract = await request('openapi.json');
  assert.equal(contract.status, 200);
  assert.equal(contract.body.openapi, '3.1.0');
  assert.equal((await request('auth/logout', 'POST', {}, token)).status, 204);
  assert.equal((await request('me', 'GET', undefined, token)).status, 401);
  // Logout in the app must not revoke the web session.
  assert.equal(
    (await fetch(`${origin}/api/snapshot`, { headers: { Cookie: webCookie } })).status,
    200,
  );
  console.log(
    'API móvel HTTP aprovada: cadastro, login Bearer sem Origin, perfil, paginação, reserva concorrente, leitura no site, cancelamento concorrente, isolamento e logout.',
  );
}
