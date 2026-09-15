import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessNotice, FormMessage, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { formatInZone } from '@/lib/time';
import { getCustomer } from '@/modules/customers/customers';
import { isAllowed } from '@/modules/tenancy/context';
import { pageAccess } from '@/server/context';
import {
  BookingStatusBadge,
  ConversationStatusBadge,
  LeadStatusBadge,
  Panel,
} from '../../_components/status';
import { EraseCustomerForm } from './erase-form';

export const metadata: Metadata = { title: 'Customer' };

async function load(id: string) {
  const { dashboard, allowed } = await pageAccess('customers.view');
  if (!allowed) return { denied: true as const };
  try {
    const customer = await withTenant(dashboard.ctx.organizationId, (scope) =>
      getCustomer(scope, dashboard.ctx, id),
    );
    return { dashboard, customer };
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erased?: string }>;
}) {
  const [{ id }, { erased }] = await Promise.all([params, searchParams]);
  const data = await load(id);
  if (data === null) notFound();
  if ('denied' in data) return <AccessNotice what="customers" />;
  const { dashboard, customer } = data;
  const tz = dashboard.organization.timezone;

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/app/customers" className="text-sm text-ink-2 hover:text-ink">
        ← Customers
      </Link>
      {erased && (
        <FormMessage tone="success">
          Personal data erased. Bookings stay in the statistics without a name.
        </FormMessage>
      )}
      <PageHeader
        eyebrow="Customer"
        title={customer.name ?? 'Anonymised customer'}
        description={
          customer.anonymisedAt
            ? `Personal data was erased on ${formatInZone(customer.anonymisedAt, tz, 'd MMMM yyyy')}.`
            : [customer.email, customer.phone].filter(Boolean).join(' · ')
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="eyebrow">Bookings</h2>
          {customer.bookings.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">No bookings.</p>
          ) : (
            <ul className="mt-2 divide-y divide-rule">
              {customer.bookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/app/bookings/${b.id}`} className="hover:underline">
                    {b.service.name}
                    <span className="block font-mono text-[0.6875rem] text-ink-3">
                      {b.reference} · {formatInZone(b.startsAt, tz, 'd MMM yyyy HH:mm')}
                    </span>
                  </Link>
                  <BookingStatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel className="p-4">
            <h2 className="eyebrow">Conversations</h2>
            {customer.conversations.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">No conversations.</p>
            ) : (
              <ul className="mt-2 divide-y divide-rule">
                {customer.conversations.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/app/inbox/${c.id}`} className="hover:underline">
                      {c.channel === 'EMAIL' ? (c.subject ?? 'Email') : 'Web chat'}
                      <span className="block font-mono text-[0.6875rem] text-ink-3">
                        {formatInZone(c.lastMessageAt, tz, 'd MMM yyyy HH:mm')}
                      </span>
                    </Link>
                    <ConversationStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {customer.leads.length > 0 && (
            <Panel className="p-4">
              <h2 className="eyebrow">Leads</h2>
              <ul className="mt-2 divide-y divide-rule">
                {customer.leads.map((lead) => (
                  <li key={lead.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span className="line-clamp-2">{lead.summary}</span>
                    <LeadStatusBadge status={lead.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {isAllowed(dashboard.ctx, 'customers.erase') && !customer.anonymisedAt && (
        <section
          aria-labelledby="erase-title"
          className="rounded-[var(--radius-lg)] border border-danger-600/30 p-4"
        >
          <h2 id="erase-title" className="text-sm font-semibold text-danger-700">
            Erase personal data
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            For when a customer asks to be forgotten. Their name, email and phone are removed, their messages
            are replaced with a note, and private booking links stop working. Bookings remain as anonymous
            rows so your numbers stay correct. This can’t be undone.
          </p>
          <EraseCustomerForm customerId={customer.id} name={customer.name ?? 'this customer'} />
        </section>
      )}
    </div>
  );
}
