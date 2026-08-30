import { createEntity } from '@flighthq/entity/contract';
import type { HostProtocolCapabilities } from '@flighthq/types/contract';

type WebProtocolCapabilities = Required<Pick<HostProtocolCapabilities, 'launch' | 'registration'>>;

export function createWebProtocolCapabilities(): WebProtocolCapabilities {
  const registeredSchemes: string[] = [];
  return {
    launch: createEntity({
      getLaunchUrl: () => {
        if (typeof location === 'undefined') return null;
        try {
          const url = new URLSearchParams(location.search).get('url');
          return url && url.length > 0 ? url : null;
        } catch {
          return null;
        }
      },
    }),
    registration: createEntity({
      getRegisteredSchemes: () => {
        return registeredSchemes.slice();
      },
      register: (scheme: string) => {
        if (typeof navigator === 'undefined' || typeof location === 'undefined') return false;
        const registerProtocolHandler = Reflect.get(navigator, 'registerProtocolHandler');
        if (typeof registerProtocolHandler !== 'function') return false;
        try {
          Reflect.apply(registerProtocolHandler, navigator, [scheme, location.origin + '/?url=%s']);
          if (!registeredSchemes.includes(scheme)) registeredSchemes.push(scheme);
          return true;
        } catch {
          return false;
        }
      },
    }),
  };
}
