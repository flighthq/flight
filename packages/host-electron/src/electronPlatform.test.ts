import type { PlatformInfo } from '@flighthq/types';

import type { ElectronApi } from './electronModule';
import { createElectronPlatformBackend } from './electronPlatform';

function fakeElectron(): ElectronApi {
  return {
    app: {
      getLocale: () => 'en-US',
    },
  } as unknown as ElectronApi;
}

describe('createElectronPlatformBackend', () => {
  it('fills platform info from process and electron locale', () => {
    const backend = createElectronPlatformBackend(fakeElectron());
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
