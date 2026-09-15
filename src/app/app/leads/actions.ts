'use server';

import { revalidatePath } from 'next/cache';
import type { LeadStatus } from '@/generated/prisma/enums';
import { withTenant } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { assignLead, updateLeadStatus } from '@/modules/crm/leads';
import { field } from '@/server/actions';
import { requireMember } from '@/server/context';

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'WON', 'LOST'];

export async function updateLeadAction(form: FormData): Promise<void> {
  const ctx = await requireMember('leads.update');
  const leadId = field(form, 'leadId');
  const status = field(form, 'status') as LeadStatus;
  const assignee = form.get('assigneeId');
  await withTenant(ctx.organizationId, async (scope) => {
    if (status) {
      if (!STATUSES.includes(status)) throw new AppError('VALIDATION', 'Unknown status.');
      await updateLeadStatus(scope, ctx, leadId, status);
    }
    if (typeof assignee === 'string') await assignLead(scope, ctx, leadId, assignee || null);
  });
  revalidatePath('/app/leads');
  revalidatePath('/app', 'layout');
}
