'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IconClose, IconMenu } from '@/components/ui/icons';
import type { NavCountKey, NavItem } from './nav-config';
import { SidebarNav } from './sidebar-nav';

/** Slide-over navigation for small screens. Closes on route change and on Escape. */
export function MobileNav({
  groups,
  counts,
  footer,
}: {
  groups: { label: string; items: NavItem[] }[];
  counts: Record<NavCountKey, number>;
  footer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Close when navigation completes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-ml-2 inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-ink-2 hover:bg-sunken lg:hidden"
        aria-label="Open navigation"
        aria-haspopup="dialog"
      >
        <IconMenu />
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === dialogRef.current && setOpen(false)}
        className="m-0 h-dvh max-h-dvh w-[18rem] max-w-[85vw] border-r border-rule bg-surface p-0 backdrop:bg-ink/30"
        aria-label="Navigation"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 items-center justify-end border-b border-rule px-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-ink-2 hover:bg-sunken"
              aria-label="Close navigation"
            >
              <IconClose />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <SidebarNav groups={groups} counts={counts} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-rule p-3">{footer}</div>
        </div>
      </dialog>
    </>
  );
}
