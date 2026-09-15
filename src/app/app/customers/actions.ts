'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withTenant } from '@/lib/db';
import { eraseCustomer } from '@/modules/customers/customers';
import { field, runAction, type ActionResult } from '@/server/actions';
import { requireMember } from '@/server/context';

export async function eraseCustomerAction(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  return runAction('customers.erase', async () => {
    const ctx = await requireMember('customers.erase');
    const customerId = field(form, 'customerId');
    await withTenant(ctx.organizationId, (scope) => eraseCustomer(scope, ctx, customerId));
    revalidatePath('/app/customers');
    redirect(`/app/customers/${customerId}?erased=1`);
  });
}
