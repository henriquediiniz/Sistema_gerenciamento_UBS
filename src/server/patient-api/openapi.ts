import { z } from 'zod';
import * as c from './contracts';

const registered = z.object({ id: z.string() });
const me = z.object({ user: c.userOutput, patient: c.profileOutput });
export const schemas = {
  LoginInput: c.loginInput,
  RegisterInput: c.registerInput,
  ProfileInput: c.profileInput,
  ReservationInput: c.reservationInput,
  EmptyInput: c.emptyInput,
  AuthResponse: c.envelope(c.authOutput),
  RegistrationResponse: c.envelope(registered),
  MeResponse: c.envelope(me),
  TicketResponse: c.envelope(c.ticketOutput),
  ServicesResponse: c.collection(c.serviceOutput),
  SlotsResponse: c.collection(c.slotOutput),
  TicketsResponse: c.collection(c.ticketOutput),
  VaccinationsResponse: c.collection(c.vaccinationOutput),
  PendingVaccinationsResponse: c.collection(c.pendingOutput),
  VisitsResponse: c.collection(c.visitOutput),
  ErrorResponse: c.errorOutput,
};
type SchemaName = keyof typeof schemas;
type Endpoint = {
  operationId: string;
  path: string;
  method: 'get' | 'post' | 'patch';
  summary: string;
  public?: boolean;
  input?: SchemaName;
  output?: SchemaName;
  status?: number;
  paginated?: boolean;
  query?: string[];
  idempotent?: boolean;
};
export const endpoints = [
  {
    operationId: 'loginPatient',
    path: '/auth/login',
    method: 'post',
    summary: 'Entrar com uma conta de paciente; sessão válida por oito horas',
    public: true,
    input: 'LoginInput',
    output: 'AuthResponse',
  },
  {
    operationId: 'registerPatient',
    path: '/auth/register',
    method: 'post',
    summary: 'Criar conta de paciente; faça login após o cadastro',
    public: true,
    input: 'RegisterInput',
    output: 'RegistrationResponse',
    status: 201,
  },
  {
    operationId: 'logoutPatient',
    path: '/auth/logout',
    method: 'post',
    summary: 'Revogar somente a sessão móvel enviada',
    input: 'EmptyInput',
    status: 204,
  },
  {
    operationId: 'getMe',
    path: '/me',
    method: 'get',
    summary: 'Consultar conta e cadastro próprios',
    output: 'MeResponse',
  },
  {
    operationId: 'updateMe',
    path: '/me',
    method: 'patch',
    summary: 'Atualizar dados próprios; não permite mudar área, ACS, perfil ou e-mail',
    input: 'ProfileInput',
    output: 'MeResponse',
  },
  {
    operationId: 'listServices',
    path: '/services',
    method: 'get',
    summary: 'Listar serviços da UBS',
    output: 'ServicesResponse',
    paginated: true,
  },
  {
    operationId: 'listSlots',
    path: '/slots',
    method: 'get',
    summary: 'Listar períodos futuros com vagas; padrão hoje até hoje + 30 dias',
    output: 'SlotsResponse',
    paginated: true,
    query: ['service_id', 'date_from', 'date_to'],
  },
  {
    operationId: 'listTickets',
    path: '/tickets',
    method: 'get',
    summary: 'Listar somente as próprias fichas',
    output: 'TicketsResponse',
    paginated: true,
    query: ['status'],
  },
  {
    operationId: 'getTicket',
    path: '/tickets/{id}',
    method: 'get',
    summary: 'Consultar uma ficha própria; não expõe dados de outras pessoas na fila',
    output: 'TicketResponse',
  },
  {
    operationId: 'reserveSlot',
    path: '/reservations',
    method: 'post',
    summary:
      'Reservar vaga para o paciente autenticado; mesma chave e vaga repetem a ficha, sem duplicá-la',
    input: 'ReservationInput',
    output: 'TicketResponse',
    status: 201,
    idempotent: true,
  },
  {
    operationId: 'cancelTicket',
    path: '/tickets/{id}/cancel',
    method: 'post',
    summary: 'Cancelar ficha reservada antes do início; repetir cancelamento é seguro',
    input: 'EmptyInput',
    output: 'TicketResponse',
  },
  {
    operationId: 'listVaccinations',
    path: '/me/vaccinations',
    method: 'get',
    summary: 'Consultar próprias vacinas aplicadas',
    output: 'VaccinationsResponse',
    paginated: true,
  },
  {
    operationId: 'listPendingVaccinations',
    path: '/me/pending-vaccinations',
    method: 'get',
    summary: 'Consultar doses previstas; não são agendamentos nem recomendações automáticas',
    output: 'PendingVaccinationsResponse',
    paginated: true,
  },
  {
    operationId: 'listVisits',
    path: '/me/visits',
    method: 'get',
    summary: 'Consultar próprias visitas de ACS, sem anotações internas da equipe',
    output: 'VisitsResponse',
    paginated: true,
  },
] satisfies Endpoint[];
export const apiEndpoints: readonly Endpoint[] = endpoints;
const ref = (name: SchemaName) => ({ $ref: `#/components/schemas/${name}` });
const jsonResponse = (name: SchemaName, description: string) => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});
export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of apiEndpoints) {
    const parameters: unknown[] = [];
    if (endpoint.path.includes('{id}'))
      parameters.push({
        in: 'path',
        name: 'id',
        required: true,
        schema: { type: 'string', minLength: 1 },
        description: 'ID opaco da ficha; não é seu número.',
      });
    if (endpoint.paginated)
      parameters.push(
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
        },
        {
          in: 'query',
          name: 'page_size',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      );
    for (const name of endpoint.query || [])
      parameters.push({
        in: 'query',
        name,
        schema:
          name === 'status'
            ? { type: 'string', enum: c.ticketStatus.options }
            : { type: 'string', ...(name.startsWith('date_') ? { format: 'date' } : {}) },
      });
    if (endpoint.idempotent)
      parameters.push({
        in: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description:
          'Gere uma UUID por intenção de reserva. Reutilize-a em tentativas da mesma reserva; após cancelamento, uma nova reserva exige outra chave.',
      });
    const status = endpoint.status || 200;
    (paths[endpoint.path] ??= {})[endpoint.method] = {
      operationId: endpoint.operationId,
      summary: endpoint.summary,
      security: endpoint.public ? [] : [{ patientBearer: [] }],
      parameters,
      ...(endpoint.input
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: ref(endpoint.input) } },
            },
          }
        : {}),
      responses: {
        [status]: endpoint.output
          ? jsonResponse(endpoint.output, 'Operação concluída')
          : { description: 'Sessão revogada; sem corpo' },
        '400': jsonResponse('ErrorResponse', 'JSON, campos, filtros ou regra de negócio inválidos'),
        '401': {
          ...jsonResponse('ErrorResponse', 'Credenciais incorretas ou sessão ausente/expirada'),
          headers: { 'WWW-Authenticate': { schema: { type: 'string' } } },
        },
        '403': jsonResponse('ErrorResponse', 'Perfil não autorizado ou origem inválida'),
        '404': jsonResponse('ErrorResponse', 'Registro não encontrado ou não pertence ao paciente'),
        '405': {
          ...jsonResponse('ErrorResponse', 'Método não permitido'),
          headers: { Allow: { schema: { type: 'string' } } },
        },
        '409': jsonResponse(
          'ErrorResponse',
          'Duplicidade, falta de vagas ou chave reutilizada para outra reserva',
        ),
        '413': jsonResponse('ErrorResponse', 'Corpo maior que 64 KiB'),
        '415': jsonResponse('ErrorResponse', 'Use Content-Type: application/json'),
        '429': jsonResponse(
          'ErrorResponse',
          'Limite de tentativas de login; aguarde quinze minutos',
        ),
        '500': jsonResponse('ErrorResponse', 'Falha interna'),
        '503': jsonResponse('ErrorResponse', 'Banco não configurado'),
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'UBS Conecta — API do paciente',
      version: '1.0.0',
      description:
        'Protótipo com dados fictícios. Sessão opaca Bearer de oito horas, sem refresh token. Cookies do site não autenticam esta API. Horários de atendimento em America/Fortaleza. Coleções usam paginação, com has_more; não há sincronização offline nem push. Campos desconhecidos são rejeitados.',
    },
    servers: [
      {
        url: 'https://sistema-gerenciamento-ubs.vercel.app/api/v1',
        description: 'Demonstração publicada',
      },
      { url: 'http://127.0.0.1:3000/api/v1', description: 'Desenvolvimento local' },
    ],
    security: [{ patientBearer: [] }],
    paths,
    components: {
      securitySchemes: {
        patientBearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Opaque',
          description:
            'Token retornado em access_token por /auth/login. Não é JWT nem o token do Turso.',
        },
      },
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([name, schema]) => [
          name,
          {
            ...z.toJSONSchema(schema, {
              target: 'draft-2020-12',
              io: name.endsWith('Input') ? 'input' : 'output',
            }),
            ...(name === 'ProfileInput' ? { minProperties: 1 } : {}),
          },
        ]),
      ),
    },
  };
}
