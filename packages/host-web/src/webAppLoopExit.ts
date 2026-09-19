import type { HostAppExitCapability } from '@flighthq/types/contract';

export const webHostAppLoopExit: HostAppExitCapability = {
  subscribe(listener) {
    if (typeof window === 'undefined') return noop;
    const pageWindow = window;
    const handler = () => listener();
    pageWindow.addEventListener('beforeunload', handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      pageWindow.removeEventListener('beforeunload', handler);
    };
  },
};

function noop(): void {}
