import type { Role } from '@/generated/prisma/enums';
import { prisma } from '@/lib/db';
import { registerUser } from '@/modules/auth/accounts';
import type { MemberContext } from '@/modules/tenancy/context';
import { createOrganizationForOwner, type OnboardingInput } from '@/modules/tenancy/organizations';

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function createUser(overrides: { name?: string; email?: string; password?: string } = {}) {
  const id = unique();
  const password = overrides.password ?? 'a-long-test-password';
  const user = await registerUser({
    name: overrides.name ?? `Test User ${id}`,
    email: overrides.email ?? `user-${id}@example.com`,
    password,
  });
  return { ...user, password };
}

export async function createBusiness(overrides: Partial<OnboardingInput> = {}) {
  const owner = await createUser();
  const id = unique();
  const { organization, membership } = await createOrganizationForOwner(owner, {
    businessName: `Test Business ${id}`,
    slug: `test-${id}`,
    weekdayOpens: '08:00',
    weekdayCloses: '16:00',
    serviceName: 'Standard service',
    serviceDurationMinutes: 60,
    servicePriceNok: 990,
    ...overrides,
  });
  const ctx: MemberContext = {
    kind: 'member',
    organizationId: organization.id,
    userId: owner.id,
    membershipId: membership.id,
    role: 'OWNER',
    name: owner.name,
  };
  return { owner, organization, membership, ctx };
}

export async function addMember(organizationId: string, role: Role) {
  const user = await createUser();
  const membership = await prisma.membership.create({ data: { organizationId, userId: user.id, role } });
  const ctx: MemberContext = {
    kind: 'member',
    organizationId,
    userId: user.id,
    membershipId: membership.id,
    role,
    name: user.name,
  };
  return { user, membership, ctx };
}
