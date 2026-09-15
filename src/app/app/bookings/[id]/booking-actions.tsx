'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/misc';
import { SubmitButton } from '@/components/ui/submit-button';
import { IDLE_RESULT, type ActionResult } from '@/lib/action-result';
import { cancelBookingAction, decideBookingAction, rescheduleBookingAction } from '../actions';
import { SlotPicker } from '../_components/slot-picker';

type Mode = null | 'decline' | 'cancel' | 'reschedule';

export function BookingActions({
  bookingId,
  serviceId,
  status,
  date,
  today,
  can,
}: {
  bookingId: string;
  serviceId: string;
  status: 'PENDING' | 'CONFIRMED';
  date: string;
  today: string;
  can: { decide: boolean; cancel: boolean; reschedule: boolean };
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [decideState, decide] = useActionState(decideBookingAction, IDLE_RESULT);
  const [cancelState, cancel] = useActionState(cancelBookingAction, IDLE_RESULT);
  const [moveState, move] = useActionState(rescheduleBookingAction, IDLE_RESULT);
  const results: ActionResult[] = [decideState, cancelState, moveState];
  const error = results.find((r) => !r.ok);
  const success = results.find((r) => r.ok && r.message);

  return (
    <section
      aria-label="Booking actions"
      className="space-y-3 rounded-[var(--radius-lg)] border border-rule bg-surface p-4"
    >
      {error && !error.ok && <FormMessage tone="error">{error.message}</FormMessage>}
      {success?.ok && <FormMessage tone="success">{success.message}</FormMessage>}

      {status === 'PENDING' && can.decide && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-medium">This booking needs your approval.</span>{' '}
            <span className="text-ink-2">The slot is held until you decide.</span>
          </p>
          <div className="flex gap-2">
            <form action={decide}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="decision" value="APPROVE" />
              <SubmitButton size="sm" pendingLabel="Approving…">
                Approve
              </SubmitButton>
            </form>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMode(mode === 'decline' ? null : 'decline')}
            >
              Decline…
            </Button>
          </div>
        </div>
      )}

      {mode === 'decline' && (
        <form action={decide} className="flex flex-wrap items-end gap-3 border-t border-rule pt-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="decision" value="DECLINE" />
          <TextField
            label="Reason (shown to the team)"
            name="reason"
            optional
            maxLength={300}
            className="min-w-64 flex-1"
          />
          <SubmitButton variant="danger" size="sm" pendingLabel="Declining…">
            Decline booking
          </SubmitButton>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {can.reschedule && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setMode(mode === 'reschedule' ? null : 'reschedule')}
          >
            Move to another time
          </Button>
        )}
        {can.cancel && (
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'cancel' ? null : 'cancel')}>
            Cancel booking…
          </Button>
        )}
      </div>

      {mode === 'reschedule' && (
        <form action={move} className="space-y-4 border-t border-rule pt-4">
          <input type="hidden" name="bookingId" value={bookingId} />
          <SlotPicker serviceId={serviceId} initialDate={date} minDate={today} excludeBookingId={bookingId} />
          <SubmitButton size="sm" pendingLabel="Moving…">
            Move booking
          </SubmitButton>
        </form>
      )}

      {mode === 'cancel' && (
        <form action={cancel} className="flex flex-wrap items-end gap-3 border-t border-rule pt-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <TextField label="Note" name="reason" optional maxLength={300} className="min-w-64 flex-1" />
          <SubmitButton variant="danger" size="sm" pendingLabel="Cancelling…">
            Cancel booking
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
