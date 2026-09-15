import Link from 'next/link';
import { RelayWordmark } from '@/components/brand/logo';
import { IconBook, IconChevronDown, IconLogout } from '@/components/ui/icons';
import { DemoModeTag } from '@/components/ui/misc';
import { withTenant } from '@/lib/db';
import { env } from '@/lib/env';
import { formatInZone } from '@/lib/time';
import { listNotifications } from '@/modules/notifications/notifications';
import { isAllowed } from '@/modules/tenancy/context';
import { ROLE_LABELS } from '@/modules/tenancy/permissions';
import { requireDashboard } from '@/server/context';
import { logoutAction, switchOrganizationAction } from '../(auth)/actions';
import { MobileNav } from './_components/mobile-nav';
import { NAV_GROUPS, type NavCountKey } from './_components/nav-config';
import { NotificationsMenu } from './_components/notifications-menu';
import { SidebarNav } from './_components/sidebar-nav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { ctx, organization, memberships, session } = await requireDashboard();

  const { counts, notifications } = await withTenant(ctx.organizationId, async (scope) => {
    const { db, organizationId } = scope;
    const [needsHuman, pendingBookings, openTasks, newLeads, notifications] = await Promise.all([
      db.conversation.count({ where: { organizationId, status: 'NEEDS_HUMAN' } }),
      db.booking.count({ where: { organizationId, status: 'PENDING', startsAt: { gte: new Date() } } }),
      db.task.count({
        where: {
          organizationId,
          status: 'OPEN',
          OR: [{ assigneeId: ctx.membershipId }, { assigneeId: null }],
        },
      }),
      db.lead.count({ where: { organizationId, status: 'NEW' } }),
      listNotifications(scope, ctx.membershipId),
    ]);
    return {
      counts: { needsHuman, pendingBookings, openTasks, newLeads } satisfies Record<NavCountKey, number>,
      notifications,
    };
  });

  // Only show sections this role can open. The pages check again on the server.
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isAllowed(ctx, item.permission)),
  })).filter((group) => group.items.length > 0);

  const userFooter = (
    <div className="space-y-1">
      <Link
        href="/learn"
        className="flex h-9 items-center gap-2.5 rounded-[var(--radius-md)] px-3 text-sm text-ink-2 hover:bg-sunken/60 hover:text-ink"
      >
        <IconBook className="text-ink-3" />
        How Relay works
      </Link>
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pine-700 text-xs font-semibold text-white"
          aria-hidden
        >
          {initials(session.user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="truncate text-xs text-ink-3">{ROLE_LABELS[ctx.role]}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-ink-3 hover:bg-sunken hover:text-ink"
            aria-label="Log out"
            title="Log out"
          >
            <IconLogout />
          </button>
        </form>
      </div>
    </div>
  );

  const orgSwitcher =
    memberships.length > 1 ? (
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 hover:bg-sunken/60 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{organization.name}</span>
            <span className="block text-xs text-ink-3">Switch business</span>
          </span>
          <IconChevronDown className="size-4 text-ink-3 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="absolute right-3 left-3 z-30 mt-1 overflow-hidden rounded-[var(--radius-md)] border border-rule bg-surface shadow-[var(--shadow-pop)]">
          {memberships.map((m) => (
            <li key={m.id}>
              <form action={switchOrganizationAction}>
                <input type="hidden" name="organizationId" value={m.organization.id} />
                <button
                  type="submit"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-sunken"
                  aria-current={m.organization.id === organization.id ? 'true' : undefined}
                >
                  <span className="truncate">{m.organization.name}</span>
                  <span className="text-xs text-ink-3">{ROLE_LABELS[m.role]}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </details>
    ) : (
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium">{organization.name}</p>
        <Link
          href={`/w/${organization.slug}`}
          className="text-xs text-ink-3 hover:text-pine-700 hover:underline"
        >
          View public page
        </Link>
      </div>
    );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only-focusable fixed top-2 left-2 z-50 rounded bg-ink px-3 py-2 text-sm text-white"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-rule px-6">
          <Link href="/app/today" aria-label="Relay — Today">
            <RelayWordmark />
          </Link>
        </div>
        <div className="border-b border-rule px-3 py-3">{orgSwitcher}</div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <SidebarNav groups={groups} counts={counts} />
        </div>
        <div className="border-t border-rule p-3">{userFooter}</div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-paper/92 px-4 backdrop-blur-sm sm:px-6 lg:px-10">
          <MobileNav groups={groups} counts={counts} footer={userFooter} />
          <p className="truncate text-sm font-medium lg:hidden">{organization.name}</p>
          <div className="ml-auto flex items-center gap-3">
            {env.DEMO_MODE && (
              <Link
                href="/learn/simulations"
                className="hidden sm:block"
                title="What is simulated in this demo"
              >
                <DemoModeTag>Demo mode · AI & email simulated</DemoModeTag>
              </Link>
            )}
            <NotificationsMenu
              unread={notifications.unread}
              items={notifications.items.map((n) => ({
                id: n.id,
                title: n.title,
                body: n.body,
                href: n.href,
                unread: !n.readAt,
                createdLabel: formatInZone(n.createdAt, organization.timezone, 'd MMM, HH:mm'),
              }))}
            />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[78rem] px-4 py-6 focus:outline-none sm:px-6 lg:px-10 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
