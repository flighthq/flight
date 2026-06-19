import type { PlatformBackend, PlatformInfo } from '@flighthq/types';

import {
  createPlatformInfo,
  createWebPlatformBackend,
  getPlatformBackend,
  getPlatformInfo,
  getPlatformKind,
  getPlatformName,
  isPlatformDesktop,
  isPlatformMobile,
  isPlatformTouch,
  isPlatformWeb,
  setPlatformBackend,
} from './platform';

function fakeBackend(info: Partial<PlatformInfo>): PlatformBackend {
  return {
    getInfo(out) {
      Object.assign(out, createPlatformInfo(), info);
      return out;
    },
  };
}

afterEach(() => setPlatformBackend(null));

describe('createPlatformInfo', () => {
  it('allocates a zeroed PlatformInfo', () => {
    expect(createPlatformInfo()).toEqual({
      arch: '',
      isTouch: false,
      kind: 'unknown',
      locale: '',
      name: 'unknown',
      version: '',
    });
  });
});

describe('createWebPlatformBackend', () => {
  it('produces a backend that fills the out info', () => {
    const out = createPlatformInfo();
    const result = createWebPlatformBackend().getInfo(out);
    expect(result).toBe(out);
    expect(typeof result.name).toBe('string');
  });
});

describe('getPlatformBackend', () => {
  it('falls back to a web backend when none is registered', () => {
    expect(getPlatformBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend({ kind: 'desktop', name: 'windows' });
    setPlatformBackend(backend);
    expect(getPlatformBackend()).toBe(backend);
  });
});

describe('getPlatformInfo', () => {
  it('fills and returns the out parameter', () => {
    setPlatformBackend(fakeBackend({ arch: 'arm64', kind: 'mobile', name: 'ios' }));
    const out = createPlatformInfo();
    expect(getPlatformInfo(out)).toBe(out);
    expect(out.name).toBe('ios');
    expect(out.arch).toBe('arm64');
  });
});

describe('getPlatformKind', () => {
  it('returns the active backend kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'desktop' }));
    expect(getPlatformKind()).toBe('desktop');
  });
});

describe('getPlatformName', () => {
  it('returns the active backend name', () => {
    setPlatformBackend(fakeBackend({ name: 'macos' }));
    expect(getPlatformName()).toBe('macos');
  });
});

describe('isPlatformDesktop', () => {
  it('is true only for desktop kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'desktop' }));
    expect(isPlatformDesktop()).toBe(true);
    setPlatformBackend(fakeBackend({ kind: 'web' }));
    expect(isPlatformDesktop()).toBe(false);
  });
});

describe('isPlatformMobile', () => {
  it('is true only for mobile kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'mobile' }));
    expect(isPlatformMobile()).toBe(true);
  });
});

describe('isPlatformTouch', () => {
  it('reflects the backend isTouch flag', () => {
    setPlatformBackend(fakeBackend({ isTouch: true }));
    expect(isPlatformTouch()).toBe(true);
  });
});

describe('isPlatformWeb', () => {
  it('is true only for web kind', () => {
    setPlatformBackend(fakeBackend({ kind: 'web' }));
    expect(isPlatformWeb()).toBe(true);
  });
});

describe('setPlatformBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setPlatformBackend(fakeBackend({ name: 'linux' }));
    setPlatformBackend(null);
    expect(getPlatformBackend()).not.toBeNull();
  });
});
