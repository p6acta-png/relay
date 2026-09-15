import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { formatInZone } from '@/lib/time';
import { isAllowed } from '@/modules/tenancy/context';
import { canManageRole, ROLE_LABELS } from '@/modules/tenancy/permissions';
import { listTeam } from '@/modules/tenancy/team';
import { requireDashboard } from '@/server/context';
import { Initials, tableClasses } from '../../_components/status';
import { revokeInviteAction } from '../actions';
import { InviteForm, MemberControls } from './team-forms';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const { ctx, organization } = await requireDashboard();
  const { members, invites } = await listTeam(ctx);
  const canManage = isAllowed(ctx, 'team.manage');
  const tz = organization.timezone;
  const owners = members.filter((m) => m.role === 'OWNER').length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-8">
        <section aria-labelledby="members-heading" className="space-y-3">
          <div>
            <h2 id="members-heading" className="font-semibold">
              Team members
            </h2>
            <p className="mt-0.5 text-sm text-ink-3">
              Owners can do everything, including managing other owners. Admins manage setup, automations and
              the team, except owners. Staff handle the daily work: inbox, bookings, leads and tasks.
            </p>
          </div>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-rule bg-surface">
            <table className={tableClasses.table}>
              <thead>
                <tr>
                  <th className={tableClasses.th}>Person</th>
                  <th className={tableClasses.th}>Role</th>
                  <th className={tableClasses.th}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.id === ctx.membershipId;
                  const lastOwner = member.role === 'OWNER' && owners <= 1;
                  const manageable =
                    canManage && !isSelf && canManageRole(ctx.role, member.role) && !lastOwner;
                  return (
                    <tr key={member.id} className={tableClasses.row}>
                      <td className={tableClasses.td}>
                        <div className="flex items-center gap-3">
                          <Initials name={member.user.name} />
                          <div className="min-w-0">
                            <p className="font-medium">
                              {member.user.name}
                              {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-3">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-ink-3">{member.user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={tableClasses.td}>
                        {manageable ? (
                          <MemberControls
                            membershipId={member.id}
                            name={member.user.name}
                            role={member.role}
                            assignableRoles={(['OWNER', 'ADMIN', 'STAFF'] as const).filter((r) =>
                              canManageRole(ctx.role, r),
                            )}
                          />
                        ) : (
                          <Badge
                            tone={
                              member.role === 'OWNER' ? 'pine' : member.role === 'ADMIN' ? 'info' : 'neutral'
                            }
                          >
                            {ROLE_LABELS[member.role]}
                          </Badge>
                        )}
                      </td>
                      <td className={`${tableClasses.td} tabular whitespace-nowrap text-ink-2`}>
                        {formatInZone(member.createdAt, tz, 'd MMM yyyy')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {canManage && (
          <section aria-labelledby="invites-heading" className="space-y-3">
            <h2 id="invites-heading" className="font-semibold">
              Open invitations
            </h2>
            {invites.length === 0 ? (
              <p className="text-sm text-ink-3">No invitations waiting.</p>
            ) : (
              <ul className="divide-y divide-rule rounded-[var(--radius-lg)] border border-rule bg-surface">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-ink-3">
                        {ROLE_LABELS[invite.role]} · expires{' '}
                        {formatInZone(invite.expiresAt, tz, 'd MMM, HH:mm')}
                      </p>
                    </div>
                    {canManage && (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="id" value={invite.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          aria-label={`Revoke invitation for ${invite.email}`}
                        >
                          Revoke
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {canManage && (
        <aside
          aria-labelledby="invite-heading"
          className="h-fit rounded-[var(--radius-lg)] border border-rule bg-surface p-5"
        >
          <h2 id="invite-heading" className="font-semibold">
            Invite someone
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-3">
            They get a link by email and choose their own password.
          </p>
          <InviteForm canInviteAdmin={canManageRole(ctx.role, 'ADMIN')} />
        </aside>
      )}
    </div>
  );
}
