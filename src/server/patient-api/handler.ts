import { z } from 'zod';
import { ensure } from '@/domain/rules';
import { register } from '../modules/patients';
import { reserve, ticketAction } from '../modules/appointments';
import { bearerToken, patientLogin, patientLogout, patientSession } from './auth';
import * as c from './contracts';
import * as queries from './queries';
import { apiEndpoints, openApiDocument } from './openapi';
import { errorResponse, parse, parseQuery, readJson, response, validateOrigin } from './http';

export async function patientApi(request: Request, path: string[]) {
  try {
    const route = '/' + path.join('/');
    if (route === '/openapi.json' && request.method === 'GET') return response(openApiDocument());
    const candidates = apiEndpoints.filter((endpoint) =>
      new RegExp('^' + endpoint.path.replace('{id}', '[^/]+') + '$').test(route),
    );
    ensure(candidates.length, 'Rota não encontrada.', 404);
    const endpoint = candidates.find((entry) => entry.method.toUpperCase() === request.method);
    if (!endpoint)
      return response(
        { error: { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido nesta rota.' } },
        405,
        { Allow: candidates.map((entry) => entry.method.toUpperCase()).join(', ') },
      );
    validateOrigin(request);
    if (!endpoint.paginated) parseQuery(z.strictObject({}), request);
    if (endpoint.operationId === 'loginPatient') {
      const data = parse(c.loginInput, await readJson(request));
      return response({ data: await patientLogin(data.email, data.password) });
    }
    if (endpoint.operationId === 'registerPatient') {
      const data = parse(c.registerInput, await readJson(request));
      return response({ data: { id: await register({ ...data, area: 'A definir' }) } }, 201);
    }
    const token = bearerToken(request);
    if (endpoint.operationId === 'logoutPatient') {
      parse(c.emptyInput, await readJson(request));
      await patientLogout(token); // Safe to retry, including an already expired session.
      return response(null, 204);
    }
    const user = await patientSession(token);
    switch (endpoint.operationId) {
      case 'getMe':
        return response({
          data: { user: c.userOutput.parse(user), patient: await queries.profile(user) },
        });
      case 'updateMe': {
        const patient = await queries.updateProfile(
          user,
          parse(c.profileInput, await readJson(request)),
        );
        return response({
          data: { user: c.userOutput.parse({ ...user, name: patient.name }), patient },
        });
      }
      case 'listServices':
        return response(await queries.services(parseQuery(c.pageQuery, request)));
      case 'listSlots':
        return response(await queries.slots(parseQuery(c.slotQuery, request)));
      case 'listTickets':
        return response(await queries.tickets(user, parseQuery(c.ticketsQuery, request)));
      case 'getTicket':
        return response({ data: await queries.ticket(user, path[1]) });
      case 'reserveSlot': {
        const key = parse(z.uuid(), request.headers.get('idempotency-key'));
        const data = parse(c.reservationInput, await readJson(request));
        const result = await reserve(user, {
          ...data,
          patient_id: user.patient_id,
          idempotency_key: key,
        });
        return response({ data: await queries.ticket(user, result.id) }, 201);
      }
      case 'cancelTicket': {
        parse(c.emptyInput, await readJson(request));
        const ticket = await queries.ticket(user, path[1]); // Out-of-scope IDs always return 404.
        if (ticket.status !== 'CANCELADA')
          await ticketAction(user, { id: ticket.id, action: 'cancelar' });
        return response({ data: await queries.ticket(user, ticket.id) });
      }
      case 'listVaccinations':
        return response(await queries.vaccinations(user, parseQuery(c.pageQuery, request)));
      case 'listPendingVaccinations':
        return response(await queries.pendingVaccinations(user, parseQuery(c.pageQuery, request)));
      case 'listVisits':
        return response(await queries.visits(user, parseQuery(c.pageQuery, request)));
      default:
        throw new Error('Operação sem implementação.');
    }
  } catch (error) {
    return errorResponse(error);
  }
}
