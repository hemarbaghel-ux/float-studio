/// <reference types="vite/client" />

declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: null | string): ReactPortal;
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';
  export interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment, options?: unknown): Root;
  export function hydrateRoot(container: Element | Document, initialChildren: ReactNode, options?: unknown): Root;
}

declare module 'playwright/test' {
  export const test: {
    (title: string, fn: (args: { page: any; request: any }) => Promise<void> | void): void;
    describe: (title: string, fn: () => void) => void;
  };
  export const expect: (actual: any) => any;
}
