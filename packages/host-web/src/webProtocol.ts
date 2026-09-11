import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  HostProtocolCapabilities,
  HostProtocolLaunchProvider,
  HostProtocolRegistrationProvider,
} from '@flighthq/types/contract';

type WebProtocolCapabilities = Entity & Required<Pick<HostProtocolCapabilities, 'launch' | 'registration'>>;

export function createWebProtocolCapabilities(): WebProtocolCapabilities {
  const registeredSchemes: string[] = [];
  const out = allocateEntity<WebProtocolCapabilities>();
  initializeWebProtocolCapabilities(out, registeredSchemes);
  return finishEntity(out);
}

export function initializeWebProtocolCapabilities(
  out: EntityConstruction<WebProtocolCapabilities>,
  registeredSchemes: string[],
): void {
  out.launch = (() => {
    const out = allocateEntity<HostProtocolLaunchProvider>();
    initializeWebProtocolLaunchBackend(out);
    return finishEntity(out);
  })();
  out.registration = (() => {
    const out = allocateEntity<HostProtocolRegistrationProvider>();
    initializeWebProtocolRegistrationBackend(out, registeredSchemes);
    return finishEntity(out);
  })();
}

export function initializeWebProtocolLaunchBackend(out: EntityConstruction<HostProtocolLaunchProvider>): void {
  out.getLaunchUrl = () => {
    if (typeof location === 'undefined') return null;
    try {
      const url = new URLSearchParams(location.search).get('url');
      return url && url.length > 0 ? url : null;
    } catch {
      return null;
    }
  };
}

export function initializeWebProtocolRegistrationBackend(
  out: EntityConstruction<HostProtocolRegistrationProvider>,
  registeredSchemes: string[],
): void {
  out.getRegisteredSchemes = () => {
    return registeredSchemes.slice();
  };
  out.register = (scheme: string) => {
    if (typeof navigator === 'undefined' || typeof location === 'undefined') return false;
    if (typeof navigator.registerProtocolHandler !== 'function') return false;
    try {
      navigator.registerProtocolHandler(scheme, location.origin + '/?url=%s');
      if (!registeredSchemes.includes(scheme)) registeredSchemes.push(scheme);
      return true;
    } catch {
      return false;
    }
  };
}

const webProtocolCapabilities = createWebProtocolCapabilities();

export const webHostProtocolLaunch = webProtocolCapabilities.launch;
export const webHostProtocolRegistration = webProtocolCapabilities.registration;
