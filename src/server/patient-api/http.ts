import { z } from 'zod';
import { DomainError, ensure } from '@/domain/rules';
import { expectedOrigin, safeErrorCode } from '../http-policy';

export class ValidationError extends DomainError {
  constructor(public fields: { path: string; message: string }[]) {
    super('Confira os campos enviados.', 400);
  }
}
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  return result.data;
}
export function parseQuery<T extends z.ZodType>(schema: T, request: Request): z.infer<T> {
  const params = new URL(request.url).searchParams;
  ensure(
    new Set(params.keys()).size === [...params.keys()].length,
    'Não repita parâmetros de consulta.',
  );
  return parse(schema, Object.fromEntries(params));
}
export function validateOrigin(request: Request) {
  // Native clients do not send Origin. Browser callers must still be same-origin.
  // Cookies never authenticate v1; the web API keeps its existing CSRF policy.
  const origin = request.headers.get('origin');
  if (origin !== null)
    ensure(
      origin === expectedOrigin(new URL(request.url).protocol, request.headers.get('host')),
      'Origem da solicitação inválida.',
      403,
    );
}
export async function readJson(request: Request) {
  ensure(
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json',
    'Envie dados em formato JSON.',
    415,
  );
  const reader = request.body?.getReader();
  ensure(reader, 'Envie um objeto JSON.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new DomainError('A solicitação é muito grande.', 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new DomainError('JSON inválido.');
  }
}
export function response(body: unknown, status = 200, extra: Record<string, string> = {}) {
  const headers = { 'Cache-Control': 'no-store', ...extra };
  return status === 204
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });
}
export function errorResponse(error: unknown) {
  if (error instanceof ValidationError)
    return response(
      { error: { code: 'VALIDATION_ERROR', message: error.message, fields: error.fields } },
      400,
    );
  if (error instanceof DomainError) {
    const codes: Record<number, string> = {
      400: 'BUSINESS_RULE',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      429: 'RATE_LIMITED',
      503: 'SERVICE_UNAVAILABLE',
    };
    return response(
      { error: { code: codes[error.status] || 'REQUEST_ERROR', message: error.message } },
      error.status,
      error.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="patient-api"' } : {},
    );
  }
  if (error instanceof Error && error.message.includes('UNIQUE constraint'))
    return response(
      {
        error: {
          code: 'CONFLICT',
          message: 'Este cadastro já existe. Confira documento e e-mail.',
        },
      },
      409,
    );
  console.error('Falha na API do paciente:', { code: safeErrorCode(error) });
  return response(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir a operação. Tente novamente.',
      },
    },
    500,
  );
}
