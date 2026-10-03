import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PortalProps {
  children: React.ReactNode;
  container?: Element | DocumentFragment | null;
}

/**
 * Portal wrapper that safely renders children at the document body level.
 * Prevents clipping by ancestor CSS overflow: hidden, overflow: auto,
 * stacking contexts, or flexbox container clipping.
 */
export function Portal({ children, container }: PortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  const target = container || document.body;
  return createPortal(children, target);
}
