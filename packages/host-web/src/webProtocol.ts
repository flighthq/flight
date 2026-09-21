import type {
  HostProtocolCapabilities,
  HostProtocolLaunchCapability,
  HostProtocolRegistrationCapability,
} from '@flighthq/types/contract';

// A capability GROUP: host dispatch infrastructure, not a domain object Flight defines and allocates,
// so it is plain data formed as a literal — no Entity, no runtime tier, no allocate/finish bracket.
type WebProtocolCapabilities = Required<Pick<HostProtocolCapabilities, 'launch' | 'registration'>>;

export function createWebProtocolCapabilities(): WebProtocolCapabilities {
  // The registered-scheme list is per-group state the registration capability closes over, so each
  // group gets its own — the same isolation the previous per-call allocation gave.
  const registeredSchemes: string[] = [];
  return {
    launch: (() => {
      const out = {} as HostProtocolLaunchCapability;
      initializeWebProtocolLaunchBackend(out);
      return out;
    })(),
    registration: (() => {
      const out = {} as HostProtocolRegistrationCapability;
      initializeWebProtocolRegistrationBackend(out, registeredSchemes);
      return out;
    })(),
  };
}

export function initializeWebProtocolLaunchBackend(out: HostProtocolLaunchCapability): void {
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
  out: HostProtocolRegistrationCapability,
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
