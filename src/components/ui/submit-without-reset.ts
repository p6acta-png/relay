'use client';

import { startTransition } from 'react';

/**
 * React resets a `<form action={…}>` after the action finishes. That suits uncontrolled forms, but
 * a form whose inputs are controlled by React state would end up showing reset DOM values that no
 * longer match its state (a ticked box that React thinks is unticked). Controlled forms submit
 * through a transition instead, which runs the same server action without the reset.
 */
export function submitWithoutReset(formAction: (data: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };
}
