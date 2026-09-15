'use client';

import { useFormStatus } from 'react-dom';
import { Button } from './button';

/** A submit button that disables itself and shows progress while its form is submitting. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
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
