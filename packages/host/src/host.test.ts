import { EntityRuntimeKey } from '@flighthq/types/contract';

import * as contract from './contract';
import { initializeHost } from './host';

describe('createHost', () => {
  it('creates an Entity immediately while leaving its runtime allocation lazy', () => {
    const host = requiredFunction(contract, 'createHost')();

    expect(EntityRuntimeKey in host).toBe(true);
    expect(host[EntityRuntimeKey]).toBeUndefined();
  });

  it('materializes the complete stable Host shape with truthful empty groups', () => {
    const host = requiredFunction(contract, 'createHost')();

    expect(
      Object.keys(host)
        .filter((key) => key !== String(EntityRuntimeKey))
        .sort(),
    ).toEqual(HOST_GROUPS);
    for (const group of HOST_GROUPS) expect(host[group]).toEqual({});
  });

  it('preserves supplied capability-group and provider identities without populating another group', () => {
    const provider = {};
    const accessibility = { provider };
    const host = requiredFunction(contract, 'createHost')({ accessibility });

    expect(host.accessibility).toBe(accessibility);
    expect(host.accessibility.provider).toBe(provider);
    for (const group of HOST_GROUPS) {
      if (group !== 'accessibility') expect(host[group]).toEqual({});
    }
  });

  it('is reachable on the contract lane only, because an app imports a built host rather than constructing one', async () => {
    const publicLane = (await import('./index')) as Record<string, unknown>;

    expect('createHost' in contract).toBe(true);
    expect('createHost' in publicLane).toBe(false);
    expect('initializeHost' in publicLane).toBe(false);
  });
});

describe('initializeHost', () => {
  it('is the construction initializer of createHost', () => {
    expect(typeof initializeHost).toBe('function');
  });

  it('writes every group into an existing construction target without allocating', () => {
    const out = {} as Parameters<typeof initializeHost>[0];
    const media = {};
    initializeHost(out, { media });

    expect(out.media).toBe(media);
    expect(
      Object.keys(out)
        .filter((key) => key !== String(EntityRuntimeKey))
        .sort(),
    ).toEqual(HOST_GROUPS);
  });
});

const HOST_GROUPS = [
  'accessibility',
  'app',
  'clipboard',
  'connectivity',
  'dialog',
  'graphics',
  'input',
  'ipc',
  'media',
  'menu',
  'midi',
  'net',
  'notification',
  'power',
  'protocol',
  'screen',
  'share',
  'shell',
  'shortcut',
  'storage',
  'system',
  'text',
  'tray',
  'ui',
  'updater',
  'window',
] as const;

function requiredFunction(module: object, name: string): (...args: any[]) => any {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: any[]) => any;
}
