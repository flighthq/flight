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

function protocolDefault(electron: ElectronApi, registered: Set<string>): HostProtocolDefaultProvider {
  const out = allocateEntity<HostProtocolDefaultProvider>();
  populateElectronHostProtocolDefault(out, electron.app, registered);
  return finishEntity(out);
}

function protocolRegistration(electron: ElectronApi, registered: Set<string>): HostProtocolRegistrationProvider {
  const out = allocateEntity<HostProtocolRegistrationProvider>();
  populateElectronHostProtocolRegistration(out, electron.app, registered);
  return finishEntity(out);
}

function protocolUnregistration(electron: ElectronApi, registered: Set<string>): HostProtocolUnregistrationProvider {
  const out = allocateEntity<HostProtocolUnregistrationProvider>();
  populateElectronHostProtocolUnregistration(out, electron.app, registered);
  return finishEntity(out);
}

export function electronHostProtocol(electron: ElectronApi): ElectronProtocolCapabilities {
  const registered = new Set<string>();
  const out = allocateEntity<ElectronProtocolCapabilities>();
  populateElectronHostProtocol(
    out,
    protocolDefault(electron, registered),
    electronHostProtocolOpen(electron),
    protocolRegistration(electron, registered),
    electronHostProtocolRegistrationQuery(electron),
    protocolUnregistration(electron, registered),
  );
  return finishEntity(out);
}

export function electronHostProtocolDefault(electron: ElectronApi): HostProtocolDefaultProvider {
  return protocolDefault(electron, new Set());
}

export function electronHostProtocolOpen(electron: ElectronApi): HostProtocolOpenProvider {
  const out = allocateEntity<HostProtocolOpenProvider>();
  populateElectronHostProtocolOpen(out, electron.app);
  return finishEntity(out);
}

export function electronHostProtocolRegistration(electron: ElectronApi): HostProtocolRegistrationProvider {
  return protocolRegistration(electron, new Set());
}

export function electronHostProtocolRegistrationQuery(electron: ElectronApi): HostProtocolRegistrationQueryProvider {
  const out = allocateEntity<HostProtocolRegistrationQueryProvider>();
  populateElectronHostProtocolRegistrationQuery(out, electron.app);
  return finishEntity(out);
}

export function electronHostProtocolUnregistration(electron: ElectronApi): HostProtocolUnregistrationProvider {
  return protocolUnregistration(electron, new Set());
}

export function populateElectronHostProtocol(
  out: EntityConstruction<ElectronProtocolCapabilities>,
  defaultProvider: HostProtocolDefaultProvider,
  open: HostProtocolOpenProvider,
  registration: HostProtocolRegistrationProvider,
  registrationQuery: HostProtocolRegistrationQueryProvider,
  unregistration: HostProtocolUnregistrationProvider,
): void {
  out.default = defaultProvider;
  out.open = open;
  out.registration = registration;
  out.registrationQuery = registrationQuery;
  out.unregistration = unregistration;
}

export function populateElectronHostProtocolDefault(
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

export function populateElectronHostProtocolOpen(
  out: EntityConstruction<HostProtocolOpenProvider>,
  app: ElectronApi['app'],
): void {
  out.subscribe = (listener: (url: string) => void) => {
    const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
    app.on('open-url', handler);
    return () => app.removeListener('open-url', handler);
  };
}

export function populateElectronHostProtocolRegistration(
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

export function populateElectronHostProtocolRegistrationQuery(
  out: EntityConstruction<HostProtocolRegistrationQueryProvider>,
  app: ElectronApi['app'],
): void {
  out.isRegistered = (scheme: string) => app.isDefaultProtocolClient(scheme);
}

export function populateElectronHostProtocolUnregistration(
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
