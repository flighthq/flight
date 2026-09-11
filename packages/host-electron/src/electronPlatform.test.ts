import type { PlatformInfo, ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { electronHostPlatform, electronHostSystem, populateElectronHostPlatform } from './electronPlatform';

function fakeElectron(): ElectronApi {
  return {
    app: {
      getLocale: () => 'en-US',
    },
  } as unknown as ElectronApi;
}

describe('electronHostPlatform', () => {
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in electronHostPlatform(fakeElectron())).toBe(true);
  });

  it('fills platform info from process and electron locale', () => {
    const backend = electronHostPlatform(fakeElectron());
    const out = {} as PlatformInfo;
    const result = backend.getInfo(out);
    expect(result).toBe(out);
    expect(out.kind).toBe('desktop');
    expect(out.isTouch).toBe(false);
    expect(out.locale).toBe('en-US');
    // Running under Node, so name maps to a desktop OS and arch is reported.
    expect(['windows', 'macos', 'linux', 'unknown']).toContain(out.name);
    expect(typeof out.arch).toBe('string');
    expect(typeof out.version).toBe('string');
  });
});

describe('electronHostSystem', () => {
  it('constructs the Entity-backed platform slot', () => {
    const system = electronHostSystem(fakeElectron());
    expect(Object.keys(system)).toEqual(['platform']);
    expect(EntityRuntimeKey in system.platform).toBe(true);
  });
});

describe('populateElectronHostPlatform', () => {
  it('is the construction initializer of electronHostPlatform', () => {
    expect(typeof populateElectronHostPlatform).toBe('function');
  });
});
