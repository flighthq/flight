import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronProtocolCapabilities,
  HostProtocolDefaultProvider,
  HostProtocolOpenProvider,
  HostProtocolRegistrationProvider,
  HostProtocolRegistrationQueryProvider,
  HostProtocolUnregistrationProvider,
  EntityConstruction,
} from '@flighthq/types/contract';

export function createElectronProtocolCapabilities(electron: ElectronApi): ElectronProtocolCapabilities {
  const app = electron.app;
  const registered = new Set<string>();

  const registration = allocateEntity<HostProtocolRegistrationProvider>();
  initializeProtocolRegistrationBackend(registration, app, registered);
  finishEntity(registration);

  const defaultBackend = allocateEntity<HostProtocolDefaultProvider>();
  initializeProtocolDefaultBackend(defaultBackend, app, registered);
  finishEntity(defaultBackend);

  const open = allocateEntity<HostProtocolOpenProvider>();
  initializeProtocolOpenBackend(open, app);
  finishEntity(open);

  const registrationQuery = allocateEntity<HostProtocolRegistrationQueryProvider>();
  initializeProtocolRegistrationQueryBackend(registrationQuery, app);
  finishEntity(registrationQuery);

  const unregistration = allocateEntity<HostProtocolUnregistrationProvider>();
  initializeProtocolUnregistrationBackend(unregistration, app, registered);
  finishEntity(unregistration);

  const out = allocateEntity<ElectronProtocolCapabilities>();
  initializeElectronProtocolCapabilities(out, defaultBackend, open, registration, registrationQuery, unregistration);
  return finishEntity(out);
}

export function initializeElectronProtocolCapabilities(
  out: EntityConstruction<ElectronProtocolCapabilities>,
  defaultBackend: HostProtocolDefaultProvider,
  open: HostProtocolOpenProvider,
  registration: HostProtocolRegistrationProvider,
  registrationQuery: HostProtocolRegistrationQueryProvider,
  unregistration: HostProtocolUnregistrationProvider,
): void {
  out.default = defaultBackend;
  out.open = open;
  out.registration = registration;
  out.registrationQuery = registrationQuery;
  out.unregistration = unregistration;
}

export function initializeProtocolDefaultBackend(
  out: EntityConstruction<HostProtocolDefaultProvider>,
  app: ElectronApi['app'],
  registered: Set<string>,
): void {
  out.isDefault = (scheme: string) => app.isDefaultProtocolClient(scheme);
  out.removeAsDefault = (scheme: string) => app.removeAsDefaultProtocolClient(scheme);
  out.setAsDefault = (scheme: string) => {
    const succeeded = app.setAsDefaultProtocolClient(scheme);
    if (succeeded) registered.add(scheme);
    return succeeded;
  };
}

export function initializeProtocolOpenBackend(
  out: EntityConstruction<HostProtocolOpenProvider>,
  app: ElectronApi['app'],
): void {
  out.subscribe = (listener: (url: string) => void) => {
    const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
    app.on('open-url', handler);
    return () => app.removeListener('open-url', handler);
  };
}

export function initializeProtocolRegistrationBackend(
  out: EntityConstruction<HostProtocolRegistrationProvider>,
  app: ElectronApi['app'],
  registered: Set<string>,
): void {
  out.getRegisteredSchemes = () => [...registered];
  out.register = (scheme: string) => {
    const succeeded = app.setAsDefaultProtocolClient(scheme);
    if (succeeded) registered.add(scheme);
    return succeeded;
  };
}

export function initializeProtocolRegistrationQueryBackend(
  out: EntityConstruction<HostProtocolRegistrationQueryProvider>,
  app: ElectronApi['app'],
): void {
  out.isRegistered = (scheme: string) => app.isDefaultProtocolClient(scheme);
}

export function initializeProtocolUnregistrationBackend(
  out: EntityConstruction<HostProtocolUnregistrationProvider>,
  app: ElectronApi['app'],
  registered: Set<string>,
): void {
  out.unregister = (scheme: string) => {
    const succeeded = app.removeAsDefaultProtocolClient(scheme);
    if (succeeded) registered.delete(scheme);
    return succeeded;
  };
}
