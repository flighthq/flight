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

  it('preserves supplied capability-group and capability identities without populating another group', () => {
    const tree = {};
    const accessibility = { tree };
    const host = requiredFunction(contract, 'createHost')({ accessibility });

    expect(host.accessibility).toBe(accessibility);
    expect(host.accessibility.tree).toBe(tree);
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
    const audio = {};
    initializeHost(out, { audio });

    expect(out.audio).toBe(audio);
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
  'audio',
  'bitmap',
  'canvas',
  'clipboard',
  'compress',
  'connectivity',
  'decompress',
  'device',
  'dialog',
  'fileSystem',
  'font',
  'fullscreen',
  'geolocation',
  'gl',
  'glyph',
  'haptics',
  'image',
  'input',
  'ipc',
  'lifecycle',
  'mediaSession',
  'menu',
  'midi',
  'net',
  'notification',
  'permissions',
  'platform',
  'power',
  'preferences',
  'protocol',
  'screen',
  'sensors',
  'share',
  'shell',
  'shortcut',
  'socket',
  'softKeyboard',
  'statusBar',
  'surface',
  'textSegment',
  'textShaper',
  'tray',
  'updater',
  'video',
  'wgpu',
  'window',
] as const;

function requiredFunction(module: object, name: string): (...args: any[]) => any {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: any[]) => any;
}
