-- Emails for a real provider wait as QUEUED until a delivery worker hands them over and marks
-- them SENT or FAILED. (The demo provider stores them as STORED_IN_OUTBOX and never delivers.)
ALTER TYPE "EmailStatus" ADD VALUE 'QUEUED' BEFORE 'SENT';
