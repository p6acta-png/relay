'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { markAllRead } from '@/modules/notifications/notifications';
import { requireMember } from '@/server/context';

export async function markNotificationsReadAction(): Promise<void> {
  const ctx = await requireMember();
  await withTenant(ctx.organizationId, (scope) => markAllRead(scope, ctx.membershipId));
  revalidatePath('/app', 'layout');
}
