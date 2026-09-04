import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  HostProtocolCapabilities,
  ProtocolLaunchBackend,
  ProtocolRegistrationBackend,
} from '@flighthq/types/contract';

type WebProtocolCapabilities = Entity & Required<Pick<HostProtocolCapabilities, 'launch' | 'registration'>>;

export function createWebProtocolCapabilities(): WebProtocolCapabilities {
  const registeredSchemes: string[] = [];
  const out = allocateEntity<WebProtocolCapabilities>();
  out.launch = (() => {
    const out = allocateEntity<ProtocolLaunchBackend>();
    out.getLaunchUrl = () => {
      if (typeof location === 'undefined') return null;
      try {
        const url = new URLSearchParams(location.search).get('url');
        return url && url.length > 0 ? url : null;
      } catch {
        return null;
      }
    };
    return finishEntity(out);
  })();
  out.registration = (() => {
    const out = allocateEntity<ProtocolRegistrationBackend>();
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
    return finishEntity(out);
  })();
  return finishEntity(out);
}
