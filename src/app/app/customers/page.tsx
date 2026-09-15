import type { Metadata } from 'next';
import Link from 'next/link';
import { AccessNotice, EmptyState, PageHeader } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { formatInZone } from '@/lib/time';
import { listCustomers } from '@/modules/customers/customers';
import { pageAccess } from '@/server/context';
import { Initials, tableClasses as t } from '../_components/status';

export const metadata: Metadata = { title: 'Customers' };

async function load(search: string) {
  const { dashboard, allowed } = await pageAccess('customers.view');
  if (!allowed) return null;
  const customers = await withTenant(dashboard.ctx.organizationId, (scope) =>
    listCustomers(scope, dashboard.ctx, { search: search.slice(0, 80), take: 100 }),
  );
  return { dashboard, customers };
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const search = (await searchParams).q?.trim() ?? '';
  const data = await load(search);
  if (!data) return <AccessNotice what="customers" />;
  const tz = data.dashboard.organization.timezone;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customers"
        title="Customers"
        description="People who booked, asked for a quote or left their details in a conversation. Anonymous visitors aren’t listed."
      />
      <form method="get" role="search" className="flex max-w-md gap-2">
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Name, email or phone"
          className="h-10 flex-1 rounded-[var(--radius-md)] border border-rule-strong bg-white px-3 text-sm"
        />
        <button
          type="submit"
          className="h-10 rounded-[var(--radius-md)] bg-ink px-4 text-sm text-white hover:bg-pine-800"
        >
          Search
        </button>
      </form>

      {data.customers.length === 0 ? (
        <EmptyState title={search ? `Nobody matches “${search}”` : 'No customers yet'}>
          {search
            ? 'Try part of a name or an email address.'
            : 'Customers are created when someone books or leaves their details.'}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface">
          <table className={t.table}>
            <thead>
              <tr>
                <th scope="col" className={t.th}>
                  Customer
                </th>
                <th scope="col" className={t.th}>
                  Contact
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Bookings
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Conversations
                </th>
                <th scope="col" className={`${t.th} text-right`}>
                  Since
                </th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((customer) => (
                <tr key={customer.id} className={t.row}>
                  <td className={t.td}>
                    <Link
                      href={`/app/customers/${customer.id}`}
                      className="flex items-center gap-2.5 font-medium hover:underline"
                    >
                      <Initials name={customer.name ?? '?'} className="size-7" />
                      {customer.name ?? <span className="text-ink-3 italic">Anonymised</span>}
                    </Link>
                  </td>
                  <td className={t.td}>
                    <span className="block">{customer.email ?? '—'}</span>
                    {customer.phone && (
                      <span className="tabular font-mono text-[0.75rem] text-ink-3">{customer.phone}</span>
                    )}
                  </td>
                  <td className={`${t.td} tabular text-right font-mono`}>{customer._count.bookings}</td>
                  <td className={`${t.td} tabular text-right font-mono`}>{customer._count.conversations}</td>
                  <td className={`${t.td} text-right text-ink-3`}>
                    {formatInZone(customer.createdAt, tz, 'd MMM yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
