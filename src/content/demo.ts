/**
 * Demo accounts created by `npm run db:seed`. Shown on the login page only when DEMO_MODE=true.
 * The businesses and people are fictional; emails use the reserved .example domain.
 */
export const DEMO_PASSWORD = 'relay-demo-2026';

export const DEMO_ACCOUNTS = [
  {
    email: 'ingrid@eikogkant.example',
    name: 'Ingrid Solberg',
    role: 'OWNER',
    business: 'Eik & Kant',
    note: 'Owner — sees everything',
  },
  {
    email: 'amina@eikogkant.example',
    name: 'Amina Berg',
    role: 'ADMIN',
    business: 'Eik & Kant',
    note: 'Admin — manages setup and automations',
  },
  {
    email: 'jonas@eikogkant.example',
    name: 'Jonas Haugen',
    role: 'STAFF',
    business: 'Eik & Kant',
    note: 'Staff — inbox, bookings and tasks only',
  },
  {
    email: 'sofie@bakgarden.example',
    name: 'Sofie Lund',
    role: 'OWNER',
    business: 'Bakgården Frisør',
    note: 'A second business — proves data isolation',
  },
] as const;

export const DEMO_BUSINESS_SLUG = 'eik-og-kant';
