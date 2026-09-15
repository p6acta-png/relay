-- Relay: database-level guarantees that Prisma's schema language cannot express.
--
-- 1. Row-level security (RLS) on every business-owned table.
--    The app sets `app.org_id` at the start of each transaction (src/lib/db.ts → withTenant).
--    If application code ever forgets its organization filter, PostgreSQL still returns
--    only the current organization's rows — or nothing at all if no organization is set.
--    RLS applies to the restricted app role; the owner role (migrations, Prisma Studio)
--    owns the tables and therefore bypasses it by design.
--
-- 2. An exclusion constraint that makes double-booking a staff member impossible,
--    even when two requests race each other.
--
-- 3. CHECK constraints for business invariants.

-- ─── 1. Row-level security ──────────────────────────────────────────────────

-- Returns the organization for the current transaction, or NULL when none is set.
-- NULLIF guards against '' (a reset custom setting), which would otherwise fail the uuid cast.
CREATE FUNCTION app_current_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;

ALTER TABLE "StaffMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StaffMember"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "StaffService" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StaffService"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "WorkingHours" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkingHours"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "TimeOff" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TimeOff"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Service"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Customer"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Conversation"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Message"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Booking"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Lead"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Task"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "KnowledgeItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "KnowledgeItem"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Automation"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "AutomationRun" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AutomationRun"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "OutboundEmail" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OutboundEmail"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("organizationId" = app_current_org_id()) WITH CHECK ("organizationId" = app_current_org_id());

-- Identity and tenancy tables (User, Session, Organization, Membership, Invite) and
-- RateLimitBucket are intentionally NOT under RLS: they are read *before* an organization
-- is known (login, invite acceptance, public page lookup) and are only accessed by the
-- auth, tenancy and protection modules.

-- ─── 2. No double-booking ───────────────────────────────────────────────────

-- btree_gist lets a GiST index combine "same staff member" (=) with "time ranges overlap" (&&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Two PENDING/CONFIRMED bookings for the same staff member may never overlap.
-- '[)' means the range includes its start and excludes its end, so 10:00–11:00 and
-- 11:00–12:00 are allowed side by side. Declined and cancelled bookings free the slot.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlapping_staff_time"
  EXCLUDE USING gist (
    "staffMemberId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE (status IN ('PENDING', 'CONFIRMED'));

-- ─── 3. Business invariants ─────────────────────────────────────────────────

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ends_after_start" CHECK ("endsAt" > "startsAt");
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_ends_after_start" CHECK ("endsAt" > "startsAt");

ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_valid_range" CHECK (
  weekday BETWEEN 1 AND 7 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"
);

ALTER TABLE "Service" ADD CONSTRAINT "Service_bookable_has_duration" CHECK (
  kind <> 'BOOKABLE' OR ("durationMinutes" IS NOT NULL AND "durationMinutes" BETWEEN 5 AND 480)
);
ALTER TABLE "Service" ADD CONSTRAINT "Service_price_not_negative" CHECK ("priceMinor" IS NULL OR "priceMinor" >= 0);

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_policy_ranges" CHECK (
  "minNoticeMinutes" BETWEEN 0 AND 10080
  AND "bookingHorizonDays" BETWEEN 1 AND 365
  AND "cancellationWindowHours" BETWEEN 0 AND 336
  AND "slotIntervalMinutes" IN (15, 30, 60)
  AND "handoffReplyHours" BETWEEN 1 AND 168
);

ALTER TABLE "RateLimitBucket" ADD CONSTRAINT "RateLimitBucket_count_positive" CHECK (count > 0);
