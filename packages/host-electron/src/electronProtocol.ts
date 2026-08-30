import { createEntity } from '@flighthq/entity/contract';
import type { ElectronApi, Entity, HostProtocolCapabilities } from '@flighthq/types/contract';

export type ElectronProtocolCapabilities = Entity &
  Required<
    Pick<HostProtocolCapabilities, 'default' | 'open' | 'registration' | 'registrationQuery' | 'unregistration'>
  >;

export function createElectronProtocolCapabilities(electron: ElectronApi): ElectronProtocolCapabilities {
  const app = electron.app;
  const registered = new Set<string>();
  const registration = createEntity({
    getRegisteredSchemes: () => [...registered],
    register: (scheme: string) => {
      const succeeded = app.setAsDefaultProtocolClient(scheme);
      if (succeeded) registered.add(scheme);
      return succeeded;
    },
  });
  return createEntity({
    default: createEntity({
      isDefault: (scheme: string) => app.isDefaultProtocolClient(scheme),
      removeAsDefault: (scheme: string) => app.removeAsDefaultProtocolClient(scheme),
      setAsDefault: (scheme: string) => {
        const succeeded = app.setAsDefaultProtocolClient(scheme);
        if (succeeded) registered.add(scheme);
        return succeeded;
      },
    }),
    open: createEntity({
      subscribe: (listener: (url: string) => void) => {
        const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
        app.on('open-url', handler);
        return () => app.removeListener('open-url', handler);
      },
    }),
    registration,
    registrationQuery: createEntity({ isRegistered: (scheme: string) => app.isDefaultProtocolClient(scheme) }),
    unregistration: createEntity({
      unregister: (scheme: string) => {
        const succeeded = app.removeAsDefaultProtocolClient(scheme);
        if (succeeded) registered.delete(scheme);
        return succeeded;
      },
    }),
  });
}
