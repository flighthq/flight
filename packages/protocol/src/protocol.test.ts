import { connectSignal } from '@flighthq/signals';
import type { ProtocolBackend } from '@flighthq/types';

import {
  attachProtocolHandler,
  createProtocolHandler,
  createProtocolUrl,
  createWebProtocolBackend,
  detachProtocolHandler,
  disposeProtocolHandler,
  getProtocolBackend,
  getProtocolLaunchUrl,
  getRegisteredProtocolSchemes,
  isProtocolSchemeDefault,
  isProtocolSchemeRegistered,
  isValidProtocolScheme,
  parseProtocolUrl,
  registerProtocolScheme,
  registerProtocolSchemes,
  removeProtocolSchemeAsDefault,
  setProtocolBackend,
  setProtocolSchemeAsDefault,
  unregisterProtocolScheme,
  unregisterProtocolSchemes,
} from './protocol';

function fakeBackend(): ProtocolBackend & {
  registered: boolean;
  defaulted: boolean;
  launchUrl: string | null;
  pendingUrls: string[];
  fire: (url: string) => void;
} {
  let listener: ((url: string) => void) | null = null;
  const registeredSchemes: string[] = [];
  return {
    registered: false,
    defaulted: false,
    launchUrl: null,
    pendingUrls: [],
    register(_scheme) {
      this.registered = true;
      if (!registeredSchemes.includes(_scheme)) registeredSchemes.push(_scheme);
      return true;
    },
    unregister(_scheme) {
      this.registered = false;
      const idx = registeredSchemes.indexOf(_scheme);
      if (idx >= 0) registeredSchemes.splice(idx, 1);
      return true;
    },
    isRegistered(_scheme) {
      return this.registered;
    },
    getRegisteredSchemes() {
      return registeredSchemes.slice();
    },
    setAsDefault(_scheme) {
      this.defaulted = true;
      return true;
    },
    isDefault(_scheme) {
      return this.defaulted;
    },
    removeAsDefault(_scheme) {
      this.defaulted = false;
      return true;
    },
    getLaunchUrl() {
      return this.launchUrl;
    },
    drainPendingUrls() {
      const drained = this.pendingUrls.slice();
      this.pendingUrls = [];
      return drained;
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
  it('drains pre-attach pending URLs before subscribing', () => {
    const backend = fakeBackend();
    backend.pendingUrls = ['myapp://early/1', 'myapp://early/2'];
    setProtocolBackend(backend);
    const handler = createProtocolHandler();
    const received: string[] = [];
    connectSignal(handler.onOpenUrl, (url) => received.push(url));
    attachProtocolHandler(handler);
    expect(received).toEqual(['myapp://early/1', 'myapp://early/2']);
    // Pending queue is cleared — a second attach does not re-deliver them.
    attachProtocolHandler(handler);
    expect(received).toEqual(['myapp://early/1', 'myapp://early/2']);
  });

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

  it('is idempotent — reattaching does not double-fire', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    const handler = createProtocolHandler();
    let count = 0;
    connectSignal(handler.onOpenUrl, () => count++);
    attachProtocolHandler(handler);
    attachProtocolHandler(handler);
    backend.fire('myapp://x');
    expect(count).toBe(1);
  });
});

describe('createProtocolHandler', () => {
  it('creates an entity with the open-URL signal', () => {
    const handler = createProtocolHandler();
    expect(handler.onOpenUrl).toBeDefined();
  });
});

describe('createProtocolUrl', () => {
  it('builds a basic URL from all parts', () => {
    const url = createProtocolUrl({ scheme: 'myapp', host: 'open', path: '/item/1', query: { ref: 'home' } });
    expect(url).toBe('myapp://open/item/1?ref=home');
  });

  it('omits authority when host is empty', () => {
    const url = createProtocolUrl({ scheme: 'myapp', path: '/action' });
    expect(url).toBe('myapp:/action');
  });

  it('omits query when no query params', () => {
    const url = createProtocolUrl({ scheme: 'myapp', host: 'x' });
    expect(url).toBe('myapp://x');
  });

  it('percent-encodes query keys and values', () => {
    const url = createProtocolUrl({ scheme: 'myapp', query: { 'a b': 'c d' } });
    expect(url).toContain('a%20b=c%20d');
  });

  it('round-trips with parseProtocolUrl', () => {
    const parts = { scheme: 'myapp', host: 'host', path: '/path', query: { k: 'v' } };
    const url = createProtocolUrl(parts);
    const parsed = parseProtocolUrl(url);
    expect(parsed?.scheme).toBe('myapp');
    expect(parsed?.host).toBe('host');
    expect(parsed?.path).toBe('/path');
    expect(parsed?.query['k']).toBe('v');
  });
});

describe('createWebProtocolBackend', () => {
  it('reports a subscribe function and non-throwing queries', () => {
    const backend = createWebProtocolBackend();
    expect(backend.subscribe(() => {})).toBeInstanceOf(Function);
    expect(typeof backend.isRegistered('myapp')).toBe('boolean');
    expect(backend.setAsDefault('myapp')).toBe(false);
    expect(backend.isDefault('myapp')).toBe(false);
    expect(backend.removeAsDefault('myapp')).toBe(false);
    expect(backend.getLaunchUrl()).toBeNull();
    expect(backend.getRegisteredSchemes()).toBeInstanceOf(Array);
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

  it('is safe when not attached', () => {
    const handler = createProtocolHandler();
    expect(() => detachProtocolHandler(handler)).not.toThrow();
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

  it('stops delivery after dispose', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    const handler = createProtocolHandler();
    let count = 0;
    connectSignal(handler.onOpenUrl, () => count++);
    attachProtocolHandler(handler);
    disposeProtocolHandler(handler);
    backend.fire('myapp://x');
    expect(count).toBe(0);
  });
});

describe('getProtocolBackend', () => {
  it('falls back to a web backend', () => {
    expect(getProtocolBackend()).not.toBeNull();
  });

  it('returns the installed backend', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    expect(getProtocolBackend()).toBe(backend);
  });
});

describe('getProtocolLaunchUrl', () => {
  it('returns null when no launch URL', () => {
    const backend = fakeBackend();
    backend.launchUrl = null;
    setProtocolBackend(backend);
    expect(getProtocolLaunchUrl()).toBeNull();
  });

  it('returns the launch URL when present', () => {
    const backend = fakeBackend();
    backend.launchUrl = 'myapp://cold-start/item';
    setProtocolBackend(backend);
    expect(getProtocolLaunchUrl()).toBe('myapp://cold-start/item');
  });

  it('is idempotent — returns the same value on repeated calls', () => {
    const backend = fakeBackend();
    backend.launchUrl = 'myapp://x';
    setProtocolBackend(backend);
    expect(getProtocolLaunchUrl()).toBe('myapp://x');
    expect(getProtocolLaunchUrl()).toBe('myapp://x');
  });
});

describe('getRegisteredProtocolSchemes', () => {
  it('returns empty when no schemes registered', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    expect(getRegisteredProtocolSchemes()).toEqual([]);
  });

  it('includes schemes that have been registered', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    registerProtocolScheme('myapp');
    expect(getRegisteredProtocolSchemes()).toContain('myapp');
  });
});

describe('isProtocolSchemeDefault', () => {
  it('returns false by default', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    expect(isProtocolSchemeDefault('myapp')).toBe(false);
  });

  it('returns true after setProtocolSchemeAsDefault', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    setProtocolSchemeAsDefault('myapp');
    expect(isProtocolSchemeDefault('myapp')).toBe(true);
  });

  it('returns false after removeProtocolSchemeAsDefault', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    setProtocolSchemeAsDefault('myapp');
    removeProtocolSchemeAsDefault('myapp');
    expect(isProtocolSchemeDefault('myapp')).toBe(false);
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

describe('isValidProtocolScheme', () => {
  it('accepts valid custom schemes', () => {
    expect(isValidProtocolScheme('myapp')).toBe(true);
    expect(isValidProtocolScheme('my-app')).toBe(true);
    expect(isValidProtocolScheme('my.app')).toBe(true);
    expect(isValidProtocolScheme('my+app')).toBe(true);
    expect(isValidProtocolScheme('app123')).toBe(true);
  });

  it('rejects schemes not starting with a letter', () => {
    expect(isValidProtocolScheme('1app')).toBe(false);
    expect(isValidProtocolScheme('-app')).toBe(false);
  });

  it('rejects empty and non-string inputs', () => {
    expect(isValidProtocolScheme('')).toBe(false);
  });

  it('rejects reserved schemes', () => {
    expect(isValidProtocolScheme('http')).toBe(false);
    expect(isValidProtocolScheme('https')).toBe(false);
    expect(isValidProtocolScheme('ftp')).toBe(false);
    expect(isValidProtocolScheme('mailto')).toBe(false);
    expect(isValidProtocolScheme('file')).toBe(false);
  });

  it('is case-insensitive — lowercases before validation', () => {
    expect(isValidProtocolScheme('MyApp')).toBe(true);
    expect(isValidProtocolScheme('HTTP')).toBe(false);
  });
});

describe('parseProtocolUrl', () => {
  it('parses a full URL with host, path, and query', () => {
    const result = parseProtocolUrl('myapp://host/path?foo=bar&baz=qux');
    expect(result?.scheme).toBe('myapp');
    expect(result?.host).toBe('host');
    expect(result?.path).toBe('/path');
    expect(result?.query['foo']).toBe('bar');
    expect(result?.query['baz']).toBe('qux');
  });

  it('parses a URL with no host', () => {
    const result = parseProtocolUrl('myapp:/action');
    expect(result?.scheme).toBe('myapp');
    expect(result?.host).toBe('');
    expect(result?.path).toBe('/action');
  });

  it('parses a URL with no path', () => {
    const result = parseProtocolUrl('myapp://host');
    expect(result?.scheme).toBe('myapp');
    expect(result?.host).toBe('host');
    expect(result?.path).toBe('');
  });

  it('decodes percent-encoded query values', () => {
    const result = parseProtocolUrl('myapp://x?key=hello%20world');
    expect(result?.query['key']).toBe('hello world');
  });

  it('last-value-wins for duplicate query keys', () => {
    const result = parseProtocolUrl('myapp://x?k=first&k=second');
    expect(result?.query['k']).toBe('second');
  });

  it('returns null for malformed or empty input', () => {
    expect(parseProtocolUrl('')).toBeNull();
    expect(parseProtocolUrl('notaurl')).toBeNull();
    expect(parseProtocolUrl(':noscheme')).toBeNull();
  });

  it('lowercases the scheme', () => {
    const result = parseProtocolUrl('MyApp://host');
    expect(result?.scheme).toBe('myapp');
  });

  it('handles URL with no query string', () => {
    const result = parseProtocolUrl('myapp://host/path');
    expect(result?.query).toEqual({});
  });
});

describe('registerProtocolScheme', () => {
  it('registers through the backend', () => {
    setProtocolBackend(fakeBackend());
    expect(registerProtocolScheme('myapp')).toBe(true);
  });

  it('returns false for an invalid scheme without calling the backend', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    expect(registerProtocolScheme('123invalid')).toBe(false);
    expect(backend.registered).toBe(false);
  });

  it('returns false for a reserved scheme', () => {
    setProtocolBackend(fakeBackend());
    expect(registerProtocolScheme('https')).toBe(false);
  });
});

describe('registerProtocolSchemes', () => {
  it('registers multiple schemes and returns true when all succeed', () => {
    setProtocolBackend(fakeBackend());
    expect(registerProtocolSchemes(['myapp', 'myapp2'])).toBe(true);
  });

  it('returns false if any registration fails', () => {
    const backend = fakeBackend();
    let callCount = 0;
    const orig = backend.register.bind(backend);
    backend.register = (scheme) => {
      callCount++;
      return callCount === 1 ? orig(scheme) : false;
    };
    setProtocolBackend(backend);
    expect(registerProtocolSchemes(['myapp', 'myapp2'])).toBe(false);
  });

  it('returns false and skips backend for invalid schemes in the batch', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    expect(registerProtocolSchemes(['myapp', 'http'])).toBe(false);
    // 'myapp' succeeded but 'http' failed — registered reflects the partial success
    expect(backend.registered).toBe(true);
  });
});

describe('removeProtocolSchemeAsDefault', () => {
  it('removes default status through the backend', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    setProtocolSchemeAsDefault('myapp');
    expect(removeProtocolSchemeAsDefault('myapp')).toBe(true);
    expect(isProtocolSchemeDefault('myapp')).toBe(false);
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

describe('unregisterProtocolSchemes', () => {
  it('unregisters multiple schemes and returns true when all succeed', () => {
    const backend = fakeBackend();
    setProtocolBackend(backend);
    registerProtocolScheme('myapp');
    expect(unregisterProtocolSchemes(['myapp', 'myapp2'])).toBe(true);
  });

  it('returns false if any unregistration fails', () => {
    const backend = fakeBackend();
    let callCount = 0;
    const orig = backend.unregister.bind(backend);
    backend.unregister = (scheme) => {
      callCount++;
      return callCount === 1 ? orig(scheme) : false;
    };
    setProtocolBackend(backend);
    expect(unregisterProtocolSchemes(['myapp', 'myapp2'])).toBe(false);
  });
});
