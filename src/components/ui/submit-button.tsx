'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './button';

/** A submit button that disables itself and shows progress while its form is submitting. */
export function SubmitButton({
  children,
  pendingLabel,
  pending: pendingProp,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string; pending?: boolean }) {
  // `pending` is passed by forms that submit through a transition, where useFormStatus stays idle.
  const pending = useFormStatus().pending || Boolean(pendingProp);
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (
        <>
          <span
            className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
            aria-hidden
          />
          <span>{pendingLabel ?? 'Working…'}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
