import type { ProtocolBackend } from '@flighthq/types';

import type { ElectronApi } from './electronModule';

// Maps Flight's ProtocolBackend onto Electron's `app` protocol-client methods. Deep links arrive via
// the 'open-url' event (macOs); the subscribe wrapper adapts Electron's (event, url) argument shape to
// Flight's (url) listener and returns an unsubscribe that removes that exact handler.
export function createElectronProtocolBackend(electron: ElectronApi): ProtocolBackend {
  const app = electron.app;
  return {
    register(scheme) {
      return app.setAsDefaultProtocolClient(scheme);
    },
    unregister(scheme) {
      return app.removeAsDefaultProtocolClient(scheme);
    },
    isRegistered(scheme) {
      return app.isDefaultProtocolClient(scheme);
    },
    setAsDefault(scheme) {
      return app.setAsDefaultProtocolClient(scheme);
    },
    subscribe(listener) {
      // Electron passes (event, url); Flight wants just the url.
      const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
      app.on('open-url', handler);
      return () => app.removeListener('open-url', handler);
    },
  };
}
