import { createEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  attachProtocolHandler,
  createProtocolHandler,
  createProtocolUrl,
  detachProtocolHandler,
  disposeProtocolHandler,
  getProtocolLaunchUrl,
  getRegisteredProtocolSchemes,
  isProtocolSchemeDefault,
  isProtocolSchemeRegistered,
  isValidProtocolScheme,
  parseProtocolUrl,
  registerProtocolScheme,
  registerProtocolSchemes,
  removeProtocolSchemeAsDefault,
  setProtocolSchemeAsDefault,
  unregisterProtocolScheme,
  unregisterProtocolSchemes,
} from './protocol';

function createFixture() {
  const calls: string[] = [];
  let open: ((url: string) => void) | null = null;
  const unsubscribe = vi.fn();
  const host = {
    protocol: {
      default: createEntity({
        isDefault: (scheme: string) => scheme === 'flight',
        removeAsDefault: (scheme: string) => (calls.push(`removeDefault:${scheme}`), true),
        setAsDefault: (scheme: string) => (calls.push(`default:${scheme}`), true),
      }),
      launch: createEntity({ getLaunchUrl: () => 'flight://cold-start' }),
      open: createEntity({
        subscribe(listener: (url: string) => void) {
          open = listener;
          return unsubscribe;
        },
      }),
      registration: createEntity({
        getRegisteredSchemes: () => ['flight'],
        register: (scheme: string) => (calls.push(`register:${scheme}`), scheme !== 'fail'),
      }),
      registrationQuery: createEntity({ isRegistered: (scheme: string) => scheme === 'flight' }),
      unregistration: createEntity({
        unregister: (scheme: string) => (calls.push(`unregister:${scheme}`), scheme !== 'fail'),
      }),
    },
  };
  return { calls, emitOpen: (url: string) => open?.(url), host, unsubscribe };
}

describe('attachProtocolHandler', () => {
  it('forwards live opens and replaces a prior subscription', () => {
    const first = createFixture();
    const second = createFixture();
    const handler = createProtocolHandler();
    const receive = vi.fn();
    connectSignal(handler.onOpenUrl, receive);
    attachProtocolHandler(first.host, handler);
    attachProtocolHandler(second.host, handler);
    second.emitOpen('flight://warm-open');
    expect(first.unsubscribe).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledExactlyOnceWith('flight://warm-open');
  });
});

describe('createProtocolHandler', () => {
  it('creates an Entity carrying the open-url signal', () => {
    const handler = createProtocolHandler();
    expect(EntityRuntimeKey in handler).toBe(true);
    expect(handler.onOpenUrl).toBeDefined();
  });
});

describe('createProtocolUrl', () => {
  it('normalizes the path and encodes query components', () => {
    expect(
      createProtocolUrl({ host: 'open', path: 'file', query: { name: 'a b', '': 'ignored' }, scheme: 'flight' }),
    ).toBe('flight://open/file?name=a%20b');
  });

  it('supports authority-free URLs', () => {
    expect(createProtocolUrl({ path: '/open', scheme: 'flight' })).toBe('flight:/open');
  });
});

describe('detachProtocolHandler', () => {
  it('unsubscribes the current provider exactly once', () => {
    const fixture = createFixture();
    const handler = createProtocolHandler();
    attachProtocolHandler(fixture.host, handler);
    detachProtocolHandler(handler);
    detachProtocolHandler(handler);
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('disposeProtocolHandler', () => {
  it('detaches and clears signal listeners', () => {
    const fixture = createFixture();
    const handler = createProtocolHandler();
    const receive = vi.fn();
    connectSignal(handler.onOpenUrl, receive);
    attachProtocolHandler(fixture.host, handler);
    disposeProtocolHandler(handler);
    fixture.emitOpen('flight://ignored');
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
    expect(receive).not.toHaveBeenCalled();
  });
});

describe('getProtocolLaunchUrl', () => {
  it('returns the cold-start provider fact', () => {
    expect(getProtocolLaunchUrl(createFixture().host)).toBe('flight://cold-start');
  });
});

describe('getRegisteredProtocolSchemes', () => {
  it('returns the provider schemes', () => {
    expect(getRegisteredProtocolSchemes(createFixture().host)).toEqual(['flight']);
  });
});

describe('isProtocolSchemeDefault', () => {
  it('validates before querying the provider', () => {
    const host = createFixture().host;
    expect(isProtocolSchemeDefault(host, 'flight')).toBe(true);
    expect(isProtocolSchemeDefault(host, 'https')).toBe(false);
  });
});
describe('isProtocolSchemeRegistered', () => {
  it('validates before querying the provider', () => {
    const host = createFixture().host;
    expect(isProtocolSchemeRegistered(host, 'flight')).toBe(true);
    expect(isProtocolSchemeRegistered(host, 'https')).toBe(false);
  });
});
describe('isValidProtocolScheme', () => {
  it('accepts custom grammar and rejects reserved or malformed schemes', () => {
    expect(isValidProtocolScheme('flight+desktop')).toBe(true);
    expect(isValidProtocolScheme('https')).toBe(false);
    expect(isValidProtocolScheme('1flight')).toBe(false);
  });
});
describe('parseProtocolUrl', () => {
  it('parses host, path, decoded query, and lowercase scheme', () => {
    expect(parseProtocolUrl('FLIGHT://open/file?name=a%20b&empty')).toEqual({
      host: 'open',
      path: '/file',
      query: { empty: '', name: 'a b' },
      scheme: 'flight',
    });
  });

  it('returns null for malformed URLs and preserves malformed escapes', () => {
    expect(parseProtocolUrl('not-a-url')).toBeNull();
    expect(parseProtocolUrl('flight:/open?value=%ZZ')?.query).toEqual({ value: '%ZZ' });
  });
});
describe('registerProtocolScheme', () => {
  it('delegates a valid scheme', () => {
    const { calls, host } = createFixture();
    expect(registerProtocolScheme(host, 'flight')).toBe(true);
    expect(calls).toEqual(['register:flight']);
  });
});
describe('registerProtocolSchemes', () => {
  it('prevalidates the full batch and aggregates provider outcomes', () => {
    const fixture = createFixture();
    expect(registerProtocolSchemes(fixture.host, ['flight', 'https'])).toBe(false);
    expect(fixture.calls).toEqual([]);
    expect(registerProtocolSchemes(fixture.host, ['flight', 'fail'])).toBe(false);
    expect(fixture.calls).toEqual(['register:flight', 'register:fail']);
  });
});
describe('removeProtocolSchemeAsDefault', () => {
  it('delegates a valid scheme', () => {
    const { calls, host } = createFixture();
    expect(removeProtocolSchemeAsDefault(host, 'flight')).toBe(true);
    expect(calls).toEqual(['removeDefault:flight']);
  });
});
describe('setProtocolSchemeAsDefault', () => {
  it('delegates a valid scheme', () => {
    const { calls, host } = createFixture();
    expect(setProtocolSchemeAsDefault(host, 'flight')).toBe(true);
    expect(calls).toEqual(['default:flight']);
  });
});
describe('unregisterProtocolScheme', () => {
  it('delegates a valid scheme', () => {
    const { calls, host } = createFixture();
    expect(unregisterProtocolScheme(host, 'flight')).toBe(true);
    expect(calls).toEqual(['unregister:flight']);
  });
});
describe('unregisterProtocolSchemes', () => {
  it('prevalidates the full batch and aggregates provider outcomes', () => {
    const fixture = createFixture();
    expect(unregisterProtocolSchemes(fixture.host, ['flight', 'https'])).toBe(false);
    expect(fixture.calls).toEqual([]);
    expect(unregisterProtocolSchemes(fixture.host, ['flight', 'fail'])).toBe(false);
    expect(fixture.calls).toEqual(['unregister:flight', 'unregister:fail']);
  });
});
