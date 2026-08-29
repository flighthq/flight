import type { ApplicationExitBackend } from '@flighthq/types/contract';

export const webApplicationExitBackend: ApplicationExitBackend = {
  subscribe(listener) {
    webApplicationExitBackend.unsubscribe(listener);
    if (typeof window === 'undefined') return;
    const pageWindow = window;
    _applicationExitOrigins.set(listener, pageWindow);
    pageWindow.addEventListener('beforeunload', listener);
  },
  unsubscribe(listener) {
    const pageWindow = _applicationExitOrigins.get(listener);
    if (pageWindow === undefined) return;
    _applicationExitOrigins.delete(listener);
    pageWindow.removeEventListener('beforeunload', listener);
  },
};

const _applicationExitOrigins = new Map<() => void, Window>();
