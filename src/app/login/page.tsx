import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUser } from '@/server/security';
import { Login } from '@/components/login';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (sessionUser((await cookies()).get('ubs_session')?.value)) redirect('/inicio');
  return <Login />;
}
