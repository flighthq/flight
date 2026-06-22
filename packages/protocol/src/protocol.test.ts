import { connectSignal } from '@flighthq/signals';
import type { ProtocolBackend } from '@flighthq/types';

import {
  attachProtocolHandler,
  createProtocolHandler,
  createWebProtocolBackend,
  detachProtocolHandler,
  disposeProtocolHandler,
  getProtocolBackend,
  isProtocolSchemeRegistered,
  registerProtocolScheme,
  setProtocolBackend,
  setProtocolSchemeAsDefault,
  unregisterProtocolScheme,
} from './protocol';

function fakeBackend(): ProtocolBackend & {
  registered: boolean;
  defaulted: boolean;
  fire: (url: string) => void;
} {
  let listener: ((url: string) => void) | null = null;
  return {
    registered: false,
    defaulted: false,
    register(_scheme) {
      this.registered = true;
      return true;
    },
    unregister(_scheme) {
      this.registered = false;
      return true;
    },
    isRegistered(_scheme) {
      return this.registered;
    },
    setAsDefault(_scheme) {
      this.defaulted = true;
      return true;
    },
    subscribe(l) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    fire(url) {
      listener?.(url);
    },
  };
}

afterEach(() => setProtocolBackend(null));

describe('attachProtocolHandler', () => {
  it('emits onOpenUrl when the backend delivers a deep link', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    const handler = createProtocolHandler();
    let opened = '';
    connectSignal(handler.onOpenUrl, (url) => (opened = url));
    attachProtocolHandler(handler);
    backend.fire('myapp://open/123');
    expect(opened).toBe('myapp://open/123');
  });
});

describe('createProtocolHandler', () => {
  it('creates an entity with the open-URL signal', () => {
    const handler = createProtocolHandler();
    expect(handler.onOpenUrl).toBeDefined();
  });
});

describe('createWebProtocolBackend', () => {
  it('reports a subscribe function and non-throwing queries', () => {
    const backend = createWebProtocolBackend();
    expect(backend.subscribe(() => {})).toBeInstanceOf(Function);
    expect(typeof backend.isRegistered('myapp')).toBe('boolean');
    expect(backend.setAsDefault('myapp')).toBe(false);
  });
});

describe('detachProtocolHandler', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    const handler = createProtocolHandler();
    let opened = 0;
    connectSignal(handler.onOpenUrl, () => opened++);
    attachProtocolHandler(handler);
    detachProtocolHandler(handler);
    backend.fire('myapp://x');
    expect(opened).toBe(0);
  });
});

describe('disposeProtocolHandler', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    const handler = createProtocolHandler();
    attachProtocolHandler(handler);
    expect(() => disposeProtocolHandler(handler)).not.toThrow();
  });
});

describe('getProtocolBackend', () => {
  it('falls back to a web backend', () => {
    expect(getProtocolBackend()).not.toBeNull();
  });
});

describe('isProtocolSchemeRegistered', () => {
  it('reflects the backend registration state', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    expect(isProtocolSchemeRegistered('myapp')).toBe(false);
    registerProtocolScheme('myapp');
    expect(isProtocolSchemeRegistered('myapp')).toBe(true);
  });
});

describe('registerProtocolScheme', () => {
  it('registers through the backend', () => {
    setProtocolBackend(fakeBackend());
    expect(registerProtocolScheme('myapp')).toBe(true);
  });
});

describe('setProtocolBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setProtocolBackend(fakeBackend());
    setProtocolBackend(null);
    expect(getProtocolBackend()).not.toBeNull();
  });
});

describe('setProtocolSchemeAsDefault', () => {
  it('marks the scheme as default through the backend', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    expect(setProtocolSchemeAsDefault('myapp')).toBe(true);
    expect(backend.defaulted).toBe(true);
  });
});

describe('unregisterProtocolScheme', () => {
  it('unregisters through the backend', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    registerProtocolScheme('myapp');
    expect(unregisterProtocolScheme('myapp')).toBe(true);
    expect(backend.registered).toBe(false);
  });
});
