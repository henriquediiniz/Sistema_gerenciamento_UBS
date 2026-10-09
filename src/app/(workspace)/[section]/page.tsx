import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { sessionUser } from '@/server/security';
import { snapshot } from '@/server/queries';
import { sections, access, type Section } from '@/domain/model';
import { Workspace } from '@/components/workspace';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export default async function Page({
  params,
}: {
  params: Promise<{
    section: string;
  }>;
}) {
  const { section } = await params;
  if (!sections.includes(section as Section)) notFound();
  const user = await sessionUser((await cookies()).get('ubs_session')?.value);
  if (!user) redirect('/login');
  if (!access[section as Section].includes(user.role)) redirect('/inicio');
  return <Workspace initial={await snapshot(user)} section={section as Section} />;
}
