import type { ProtocolBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's ProtocolBackend onto Electron's `app` protocol-client methods. Deep links arrive via
// the 'open-url' event (macOs); the subscribe wrapper adapts Electron's (event, url) argument shape to
// Flight's (url) listener and returns an unsubscribe that removes that exact handler.
export function createElectronProtocolBackend(electron: ElectronApi): ProtocolBackend {
  const app = electron.app;
  // Electron exposes no scheme enumeration, so the seam tracks what it has registered.
  const registered = new Set<string>();
  return {
    register(scheme) {
      const ok = app.setAsDefaultProtocolClient(scheme);
      if (ok) registered.add(scheme);
      return ok;
    },
    unregister(scheme) {
      const ok = app.removeAsDefaultProtocolClient(scheme);
      registered.delete(scheme);
      return ok;
    },
    isRegistered(scheme) {
      return app.isDefaultProtocolClient(scheme);
    },
    getRegisteredSchemes() {
      return [...registered];
    },
    setAsDefault(scheme) {
      const ok = app.setAsDefaultProtocolClient(scheme);
      if (ok) registered.add(scheme);
      return ok;
    },
    isDefault(scheme) {
      return app.isDefaultProtocolClient(scheme);
    },
    removeAsDefault(scheme) {
      return app.removeAsDefaultProtocolClient(scheme);
    },
    getLaunchUrl() {
      // Electron delivers the cold-start deep link via the 'open-url'/'second-instance' events rather
      // than a queryable launch URL; report none.
      return null;
    },
    drainPendingUrls() {
      // No pre-attach buffer in this seam — deep links arrive live via the 'open-url' event.
      return [];
    },
    subscribe(listener) {
      // Electron passes (event, url); Flight wants just the url.
      const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
      app.on('open-url', handler);
      return () => app.removeListener('open-url', handler);
    },
  };
}
