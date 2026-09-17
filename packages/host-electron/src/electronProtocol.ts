import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronProtocolCapabilities,
  HostProtocolDefaultCapability,
  HostProtocolOpenCapability,
  HostProtocolRegistrationCapability,
  HostProtocolRegistrationQueryCapability,
  HostProtocolUnregistrationCapability,
  EntityConstruction,
} from '@flighthq/types/contract';

function protocolDefault(electron: ElectronApi, registered: Set<string>): HostProtocolDefaultCapability {
  const out = allocateEntity<HostProtocolDefaultCapability>();
  populateElectronHostProtocolDefault(out, electron.app, registered);
  return finishEntity(out);
}

function protocolRegistration(electron: ElectronApi, registered: Set<string>): HostProtocolRegistrationCapability {
  const out = allocateEntity<HostProtocolRegistrationCapability>();
  populateElectronHostProtocolRegistration(out, electron.app, registered);
  return finishEntity(out);
}

function protocolUnregistration(electron: ElectronApi, registered: Set<string>): HostProtocolUnregistrationCapability {
  const out = allocateEntity<HostProtocolUnregistrationCapability>();
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

export function electronHostProtocolDefault(electron: ElectronApi): HostProtocolDefaultCapability {
  return protocolDefault(electron, new Set());
}

export function electronHostProtocolOpen(electron: ElectronApi): HostProtocolOpenCapability {
  const out = allocateEntity<HostProtocolOpenCapability>();
  populateElectronHostProtocolOpen(out, electron.app);
  return finishEntity(out);
}

export function electronHostProtocolRegistration(electron: ElectronApi): HostProtocolRegistrationCapability {
  return protocolRegistration(electron, new Set());
}

export function electronHostProtocolRegistrationQuery(electron: ElectronApi): HostProtocolRegistrationQueryCapability {
  const out = allocateEntity<HostProtocolRegistrationQueryCapability>();
  populateElectronHostProtocolRegistrationQuery(out, electron.app);
  return finishEntity(out);
}

export function electronHostProtocolUnregistration(electron: ElectronApi): HostProtocolUnregistrationCapability {
  return protocolUnregistration(electron, new Set());
}

export function populateElectronHostProtocol(
  out: EntityConstruction<ElectronProtocolCapabilities>,
  defaultProvider: HostProtocolDefaultCapability,
  open: HostProtocolOpenCapability,
  registration: HostProtocolRegistrationCapability,
  registrationQuery: HostProtocolRegistrationQueryCapability,
  unregistration: HostProtocolUnregistrationCapability,
): void {
  out.default = defaultProvider;
  out.open = open;
  out.registration = registration;
  out.registrationQuery = registrationQuery;
  out.unregistration = unregistration;
}

export function populateElectronHostProtocolDefault(
  out: EntityConstruction<HostProtocolDefaultCapability>,
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
  out: EntityConstruction<HostProtocolOpenCapability>,
  app: ElectronApi['app'],
): void {
  out.subscribe = (listener: (url: string) => void) => {
    const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
    app.on('open-url', handler);
    return () => app.removeListener('open-url', handler);
  };
}

export function populateElectronHostProtocolRegistration(
  out: EntityConstruction<HostProtocolRegistrationCapability>,
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
  out: EntityConstruction<HostProtocolRegistrationQueryCapability>,
  app: ElectronApi['app'],
): void {
  out.isRegistered = (scheme: string) => app.isDefaultProtocolClient(scheme);
}

export function populateElectronHostProtocolUnregistration(
  out: EntityConstruction<HostProtocolUnregistrationCapability>,
  app: ElectronApi['app'],
  registered: Set<string>,
): void {
  out.unregister = (scheme: string) => {
    const succeeded = app.removeAsDefaultProtocolClient(scheme);
    if (succeeded) registered.delete(scheme);
    return succeeded;
  };
}
