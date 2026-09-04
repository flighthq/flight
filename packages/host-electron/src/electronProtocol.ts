import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ElectronApi,
  ElectronProtocolCapabilities,
  ProtocolDefaultBackend,
  ProtocolOpenBackend,
  ProtocolRegistrationBackend,
  ProtocolRegistrationQueryBackend,
  ProtocolUnregistrationBackend,
} from '@flighthq/types/contract';

export function createElectronProtocolCapabilities(electron: ElectronApi): ElectronProtocolCapabilities {
  const app = electron.app;
  const registered = new Set<string>();

  const registration = allocateEntity<ProtocolRegistrationBackend>();
  registration.getRegisteredSchemes = () => [...registered];
  registration.register = (scheme: string) => {
    const succeeded = app.setAsDefaultProtocolClient(scheme);
    if (succeeded) registered.add(scheme);
    return succeeded;
  };
  finishEntity(registration);

  const defaultBackend = allocateEntity<ProtocolDefaultBackend>();
  defaultBackend.isDefault = (scheme: string) => app.isDefaultProtocolClient(scheme);
  defaultBackend.removeAsDefault = (scheme: string) => app.removeAsDefaultProtocolClient(scheme);
  defaultBackend.setAsDefault = (scheme: string) => {
    const succeeded = app.setAsDefaultProtocolClient(scheme);
    if (succeeded) registered.add(scheme);
    return succeeded;
  };
  finishEntity(defaultBackend);

  const open = allocateEntity<ProtocolOpenBackend>();
  open.subscribe = (listener: (url: string) => void) => {
    const handler = (...args: unknown[]): void => listener(String(args[1] ?? ''));
    app.on('open-url', handler);
    return () => app.removeListener('open-url', handler);
  };
  finishEntity(open);

  const registrationQuery = allocateEntity<ProtocolRegistrationQueryBackend>();
  registrationQuery.isRegistered = (scheme: string) => app.isDefaultProtocolClient(scheme);
  finishEntity(registrationQuery);

  const unregistration = allocateEntity<ProtocolUnregistrationBackend>();
  unregistration.unregister = (scheme: string) => {
    const succeeded = app.removeAsDefaultProtocolClient(scheme);
    if (succeeded) registered.delete(scheme);
    return succeeded;
  };
  finishEntity(unregistration);

  const out = allocateEntity<ElectronProtocolCapabilities>();
  out.default = defaultBackend;
  out.open = open;
  out.registration = registration;
  out.registrationQuery = registrationQuery;
  out.unregistration = unregistration;
  return finishEntity(out);
}
