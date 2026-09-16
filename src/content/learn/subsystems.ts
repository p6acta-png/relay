import { BUSINESS_SUBSYSTEMS } from './subsystems-business';
import { CORE_SUBSYSTEMS } from './subsystems-core';
import { FOUNDATION_SUBSYSTEMS } from './subsystems-foundations';
import { QUALITY_SUBSYSTEMS } from './subsystems-quality';
import type { Subsystem, SubsystemGroup } from './types';

export const SUBSYSTEMS: Subsystem[] = [
  ...CORE_SUBSYSTEMS,
  ...FOUNDATION_SUBSYSTEMS,
  ...BUSINESS_SUBSYSTEMS,
  ...QUALITY_SUBSYSTEMS,
];

export const SUBSYSTEM_GROUPS: { group: SubsystemGroup; intro: string }[] = [
  { group: 'The core flow', intro: 'From a customer’s message to a booking or a person.' },
  { group: 'Foundations', intro: 'What keeps every business’s data correct, private and safe.' },
  { group: 'Running the business', intro: 'The tools owners and staff use around the core flow.' },
  { group: 'Quality', intro: 'How it is tested, run and made usable for everyone.' },
];

export function getSubsystem(slug: string): Subsystem | undefined {
  return SUBSYSTEMS.find((s) => s.slug === slug);
}
