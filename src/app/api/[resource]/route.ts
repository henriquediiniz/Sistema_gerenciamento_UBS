import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DomainError, ensure } from '@/domain/rules';
import { login, logout, sessionUser, createSession } from '@/server/security';
import { register } from '@/server/modules/patients';
import { snapshot } from '@/server/queries';
import { command } from '@/server/commands';
import { expectedOrigin, secureCookie, safeErrorCode } from '@/server/http-policy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const cookieName = 'ubs_session';
function errorResponse(error: unknown) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || 'Dados inválidos.' },
      { status: 400 },
    );
  if (error instanceof DomainError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.includes('UNIQUE constraint'))
    return NextResponse.json(
      { error: 'Este registro já existe. Confira documento, e-mail, lote, período ou dose.' },
      { status: 409 },
    );
  console.error('Falha interna na operação:', {
    name: error instanceof Error ? error.name : 'unknown',
    code: safeErrorCode(error),
  });
  return NextResponse.json(
    { error: 'Não foi possível concluir a operação. Tente novamente.' },
    { status: 500 },
  );
}
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      resource: string;
    }>;
  },
) {
  try {
    const { resource } = await params;
    ensure(resource === 'snapshot', 'Recurso não encontrado.', 404);
    const user = await sessionUser((await cookies()).get(cookieName)?.value);
    ensure(user, 'Sua sessão expirou. Entre novamente.', 401);
    return NextResponse.json(await snapshot(user), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      resource: string;
    }>;
  },
) {
  try {
    // NextURL normalizes loopback addresses to localhost; compare with the actual
    // Host header instead, or configure the canonical origin behind a proxy.
    const origin = request.headers.get('origin');
    ensure(
      origin === expectedOrigin(request.nextUrl.protocol, request.headers.get('host')),
      'Origem da solicitação inválida.',
      403,
    );
    ensure(
      request.headers.get('content-type')?.includes('application/json'),
      'Envie dados em formato JSON.',
      415,
    );
    const raw = await request.text();
    ensure(Buffer.byteLength(raw) < 65536, 'A solicitação é muito grande.', 413);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new DomainError('JSON inválido.');
    }
    ensure(input && typeof input === 'object' && !Array.isArray(input), 'Dados inválidos.');
    const { resource } = await params,
      jar = await cookies();
    if (resource === 'login' || resource === 'register') {
      let token: string;
      if (resource === 'register') token = await createSession(await register(input));
      else {
        const d = z.object({ email: z.email(), password: z.string().min(1).max(128) }).parse(input);
        token = await login(d.email, d.password);
      }
      jar.set(cookieName, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookie(),
        path: '/',
        maxAge: 28800,
      });
      return NextResponse.json({ ok: true });
    }
    const token = jar.get(cookieName)?.value;
    if (resource === 'logout') {
      await logout(token);
      jar.delete(cookieName);
      return NextResponse.json({ ok: true });
    }
    const user = await sessionUser(token);
    ensure(user, 'Sua sessão expirou. Entre novamente.', 401);
    return NextResponse.json(await command(resource, user, input), { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
