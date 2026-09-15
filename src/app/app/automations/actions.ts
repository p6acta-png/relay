'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withTenant } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { deleteAutomation, saveAutomation, setAutomationEnabled } from '@/modules/automations/manage';
import { field, runAction, type ActionResult } from '@/server/actions';
import { requireMember } from '@/server/context';

export async function saveAutomationAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('automations.save', async () => {
    const ctx = await requireMember('automations.manage');
    let definition: unknown;
    try {
      definition = JSON.parse(field(form, 'definition'));
    } catch {
      throw new AppError('VALIDATION', 'The automation could not be read. Please try again.');
    }
    const id = field(form, 'id') || undefined;
    const saved = await withTenant(ctx.organizationId, (scope) =>
      saveAutomation(scope, ctx, { id, definition }),
    );
    revalidatePath('/app/automations');
    if (!id) redirect(`/app/automations/${saved.id}?saved=1`);
    revalidatePath(`/app/automations/${saved.id}`);
    return { ok: true, message: 'Saved. The new rules apply from the next event.' };
  });
}

export async function toggleAutomationAction(form: FormData): Promise<void> {
  const ctx = await requireMember('automations.manage');
  const id = field(form, 'id');
  await withTenant(ctx.organizationId, (scope) =>
    setAutomationEnabled(scope, ctx, id, field(form, 'enabled') === 'true'),
  );
  revalidatePath('/app/automations');
  revalidatePath(`/app/automations/${id}`);
}

export async function deleteAutomationAction(form: FormData): Promise<void> {
  const ctx = await requireMember('automations.manage');
  await withTenant(ctx.organizationId, (scope) => deleteAutomation(scope, ctx, field(form, 'id')));
  revalidatePath('/app/automations');
  redirect('/app/automations');
}
