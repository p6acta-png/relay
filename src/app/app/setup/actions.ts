'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Role } from '@/generated/prisma/enums';
import { withTenant } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { addDays, zonedTimeToUtc } from '@/lib/time';
import {
  addTimeOff,
  deleteKnowledgeItem,
  removeTimeOff,
  saveKnowledgeItem,
  saveService,
  saveStaffMember,
  updateBusinessSettings,
} from '@/modules/catalog/manage';
import { receiveDemoEmail } from '@/modules/conversations/email-channel';
import { changeMemberRole, createInvite, removeMember, revokeInvite } from '@/modules/tenancy/team';
import { field, runAction, type ActionResult } from '@/server/actions';
import { requireMember } from '@/server/context';

function json(form: FormData, name: string): unknown {
  try {
    return JSON.parse(field(form, name) || 'null');
  } catch {
    throw new AppError('VALIDATION', 'The form could not be read. Please reload and try again.');
  }
}

async function timezoneOf(organizationId: string) {
  return withTenant(
    organizationId,
    async ({ db }) =>
      (await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } }))
        .timezone,
  );
}

export async function saveBusinessAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('setup.business', async () => {
    const ctx = await requireMember('setup.manage');
    await withTenant(ctx.organizationId, (scope) =>
      updateBusinessSettings(scope, ctx, json(form, 'payload')),
    );
    revalidatePath('/app', 'layout');
    return { ok: true, message: 'Saved. The chat and your public page use the new settings right away.' };
  });
}

export async function saveServiceAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('setup.service', async () => {
    const ctx = await requireMember('setup.manage');
    const id = field(form, 'id') || null;
    const saved = await withTenant(ctx.organizationId, (scope) =>
      saveService(scope, ctx, id, json(form, 'payload')),
    );
    revalidatePath('/app/setup/services');
    if (!id) redirect(`/app/setup/services/${saved.id}?saved=1`);
    return { ok: true, message: 'Service saved.' };
  });
}

export async function saveStaffAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('setup.staff', async () => {
    const ctx = await requireMember('setup.manage');
    const id = field(form, 'id') || null;
    const saved = await withTenant(ctx.organizationId, (scope) =>
      saveStaffMember(scope, ctx, id, json(form, 'payload')),
    );
    revalidatePath('/app/setup/staff');
    if (!id) redirect(`/app/setup/staff/${saved.id}?saved=1`);
    return { ok: true, message: 'Saved. New working hours apply to times Relay offers from now on.' };
  });
}

export async function addTimeOffAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'setup.time-off',
    async () => {
      const ctx = await requireMember('setup.manage');
      const tz = await timezoneOf(ctx.organizationId);
      const toInstant = (date: string, time: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
        const [h, m] = time.split(':').map(Number);
        return zonedTimeToUtc(date, h! * 60 + m!, tz);
      };
      const startDate = field(form, 'startDate');
      const endDate = field(form, 'endDate') || startDate;
      const partDay = field(form, 'partDay') === 'on';
      // Whole days by default: from local midnight on the first day to local midnight after the last
      // (computed per day, so a 23- or 25-hour DST day is still exactly one day).
      const startsAt = partDay
        ? toInstant(startDate, field(form, 'startTime'))
        : toInstant(startDate, '00:00');
      const endsAt = partDay
        ? toInstant(endDate, field(form, 'endTime'))
        : /^\d{4}-\d{2}-\d{2}$/.test(endDate)
          ? zonedTimeToUtc(addDays(endDate, 1), 0, tz)
          : null;
      const { clashes } = await withTenant(ctx.organizationId, (scope) =>
        addTimeOff(scope, ctx, {
          staffMemberId: field(form, 'staffMemberId'),
          startsAt: startsAt ?? '',
          endsAt: endsAt ?? '',
          reason: field(form, 'reason'),
        }),
      );
      revalidatePath('/app/setup/time-off');
      return {
        ok: true,
        message: clashes
          ? `Added. ${clashes} existing booking${clashes === 1 ? '' : 's'} fall in this period — check them in Bookings.`
          : 'Added. Relay won’t offer these times.',
      };
    },
    { form },
  );
}

export async function removeTimeOffAction(form: FormData): Promise<void> {
  const ctx = await requireMember('setup.manage');
  await withTenant(ctx.organizationId, (scope) => removeTimeOff(scope, ctx, field(form, 'id')));
  revalidatePath('/app/setup/time-off');
}

export async function saveKnowledgeAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'setup.knowledge',
    async () => {
      const ctx = await requireMember('setup.manage');
      const id = field(form, 'id') || null;
      await withTenant(ctx.organizationId, (scope) =>
        saveKnowledgeItem(scope, ctx, id, {
          question: field(form, 'question'),
          answer: field(form, 'answer'),
          keywords: field(form, 'keywords'),
          published: field(form, 'published') === 'on',
        }),
      );
      revalidatePath('/app/setup/knowledge');
      redirect('/app/setup/knowledge?saved=1');
    },
    { form },
  );
}

export async function deleteKnowledgeAction(form: FormData): Promise<void> {
  const ctx = await requireMember('setup.manage');
  await withTenant(ctx.organizationId, (scope) => deleteKnowledgeItem(scope, ctx, field(form, 'id')));
  revalidatePath('/app/setup/knowledge');
  redirect('/app/setup/knowledge');
}

export async function inviteAction(
  _previous: ActionResult<{ url: string }>,
  form: FormData,
): Promise<ActionResult<{ url: string }>> {
  return runAction(
    'setup.invite',
    async () => {
      const ctx = await requireMember('team.manage');
      const { url, invite } = await createInvite(ctx, {
        email: field(form, 'email'),
        role: field(form, 'role') === 'ADMIN' ? 'ADMIN' : 'STAFF',
      });
      revalidatePath('/app/setup/team');
      return { ok: true, message: `Invitation for ${invite.email} is in the email outbox.`, data: { url } };
    },
    { form },
  );
}

export async function revokeInviteAction(form: FormData): Promise<void> {
  const ctx = await requireMember('team.manage');
  await revokeInvite(ctx, field(form, 'id'));
  revalidatePath('/app/setup/team');
}

export async function changeRoleAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('setup.role', async () => {
    const ctx = await requireMember('team.manage');
    const role = field(form, 'role') as Role;
    if (!['OWNER', 'ADMIN', 'STAFF'].includes(role)) throw new AppError('VALIDATION', 'Unknown role.');
    await changeMemberRole(ctx, field(form, 'membershipId'), role);
    revalidatePath('/app/setup/team');
    return { ok: true, message: 'Role updated.' };
  });
}

export async function removeMemberAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('setup.remove-member', async () => {
    const ctx = await requireMember('team.manage');
    await removeMember(ctx, field(form, 'membershipId'));
    revalidatePath('/app/setup/team');
    return { ok: true, message: 'Removed from the team. Their open work is unassigned.' };
  });
}

export async function simulateEmailAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'setup.simulate-email',
    async () => {
      const ctx = await requireMember('setup.manage');
      const { conversationId, answered } = await receiveDemoEmail(ctx, {
        fromName: field(form, 'fromName'),
        fromEmail: field(form, 'fromEmail'),
        subject: field(form, 'subject'),
        body: field(form, 'body'),
      });
      revalidatePath('/app/setup/outbox');
      revalidatePath('/app', 'layout');
      redirect(`/app/inbox/${conversationId}?email=${answered ? 'answered' : 'handed-off'}`);
    },
    { form },
  );
}
