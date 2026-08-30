import { EntityRuntimeKey } from '@flighthq/types/contract';

import * as entity from './contract';

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

describe('createHost', () => {
  it('creates an Entity immediately while leaving its runtime allocation lazy', () => {
    const host = requiredFunction(entity, 'createHost')();

    expect(EntityRuntimeKey in host).toBe(true);
    expect(host[EntityRuntimeKey]).toBeUndefined();
  });

  it('materializes the complete stable Host shape with truthful empty groups', () => {
    const host = requiredFunction(entity, 'createHost')();

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
    const host = requiredFunction(entity, 'createHost')({ accessibility });

    expect(host.accessibility).toBe(accessibility);
    expect(host.accessibility.provider).toBe(provider);
    for (const group of HOST_GROUPS) {
      if (group !== 'accessibility') expect(host[group]).toEqual({});
    }
  });
});

function requiredFunction(module: object, name: string): (...args: any[]) => any {
  const value = Reflect.get(module, name);
  expect(value, `${name} export`).toBeTypeOf('function');
  if (typeof value !== 'function') throw new TypeError(`${name} is not exported`);
  return value as (...args: any[]) => any;
}
