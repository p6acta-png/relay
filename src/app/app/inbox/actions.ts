'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/db';
import { AppError } from '@/lib/errors';
import {
  assignConversation,
  replyAsStaff,
  setConversationStatus,
} from '@/modules/conversations/conversations';
import { field, runAction, type ActionResult } from '@/server/actions';
import { requireMember } from '@/server/context';

// Every action re-checks the session and permission on the server: a server action is a public
// POST endpoint, whatever the page that rendered its form allowed.

export async function replyAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction(
    'inbox.reply',
    async () => {
      const ctx = await requireMember('inbox.reply');
      const conversationId = field(form, 'conversationId');
      const { emailed } = await withTenant(ctx.organizationId, (scope) =>
        replyAsStaff(scope, ctx, { conversationId, body: field(form, 'body') }),
      );
      revalidatePath(`/app/inbox/${conversationId}`);
      return {
        ok: true,
        message: emailed ? 'Sent in the chat and by email (demo outbox).' : 'Sent in the chat.',
      };
    },
    { form },
  );
}

const STATUS_ACTIONS = ['resolve', 'reopen', 'take_over', 'hand_back'] as const;

export async function conversationStatusAction(form: FormData): Promise<void> {
  const ctx = await requireMember('inbox.reply');
  const conversationId = field(form, 'conversationId');
  const action = field(form, 'action') as (typeof STATUS_ACTIONS)[number];
  if (!STATUS_ACTIONS.includes(action)) throw new AppError('VALIDATION', 'Unknown action.');
  await withTenant(ctx.organizationId, (scope) => setConversationStatus(scope, ctx, conversationId, action));
  revalidatePath(`/app/inbox/${conversationId}`);
  revalidatePath('/app', 'layout');
}

export async function assignConversationAction(form: FormData): Promise<void> {
  const ctx = await requireMember('inbox.assign');
  const conversationId = field(form, 'conversationId');
  const membershipId = field(form, 'membershipId') || null;
  await withTenant(ctx.organizationId, (scope) =>
    assignConversation(scope, ctx, conversationId, membershipId),
  );
  revalidatePath(`/app/inbox/${conversationId}`);
}
