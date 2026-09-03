import type { HasSystemPlatform, PlatformBackend, PlatformInfo } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import * as platformContract from './platform';
import {
  comparePlatformVersions,
  createPlatformInfo,
  getPlatformEngine,
  getPlatformInfo,
  getPlatformKind,
  getPlatformName,
  getPlatformRuntime,
  isPlatformDesktop,
  isPlatformMobile,
  isPlatformNative,
  isPlatformTouch,
  isPlatformVersionAtLeast,
  isPlatformWeb,
} from './platform';

function fakeBackend(info: Partial<PlatformInfo>): PlatformBackend {
  return {
    [EntityRuntimeKey]: undefined,
    getInfo(out) {
      Object.assign(out, createPlatformInfo(), info);
      return out;
    },
  };
}

function fakeHost(info: Partial<PlatformInfo>): HasSystemPlatform {
  return { system: { platform: fakeBackend(info) } };
}

describe('comparePlatformVersions', () => {
  it('returns 0 for identical strings', () => {
    expect(comparePlatformVersions('10.15.7', '10.15.7')).toBe(0);
  });

  it('returns 0 for two empty strings', () => {
    expect(comparePlatformVersions('', '')).toBe(0);
  });

  it('empty string sorts lower than any version', () => {
    expect(comparePlatformVersions('', '1.0')).toBe(-1);
    expect(comparePlatformVersions('1.0', '')).toBe(1);
  });

  it('returns -1 when a is lower', () => {
    expect(comparePlatformVersions('10.15.6', '10.15.7')).toBe(-1);
    expect(comparePlatformVersions('9', '10')).toBe(-1);
    expect(comparePlatformVersions('10.0', '10.0.1')).toBe(-1);
  });

  it('returns 1 when a is higher', () => {
    expect(comparePlatformVersions('10.15.7', '10.15.6')).toBe(1);
    expect(comparePlatformVersions('11', '10')).toBe(1);
    expect(comparePlatformVersions('14', '13.0.1')).toBe(1);
  });

  it('compares numeric segments, not lexicographic', () => {
    expect(comparePlatformVersions('10', '9')).toBe(1);
    expect(comparePlatformVersions('2.10', '2.9')).toBe(1);
  });

  it('treats missing trailing segments as 0', () => {
    expect(comparePlatformVersions('10.0', '10.0.0')).toBe(0);
    expect(comparePlatformVersions('10', '10.0.0')).toBe(0);
  });
});

describe('createPlatformInfo', () => {
  it('allocates a zeroed PlatformInfo with all new fields', () => {
    expect(createPlatformInfo()).toMatchObject({
      arch: '',
      distro: '',
      distroVersion: '',
      endianness: 'unknown',
      engine: 'unknown',
      engineVersion: '',
      isTouch: false,
      kind: 'unknown',
      locale: '',
      name: 'unknown',
      osBuild: '',
      pointerWidth: -1,
      runtime: 'unknown',
      version: '',
    });
  });
});

describe('getPlatformEngine', () => {
  it('returns the engine from the host backend', () => {
    expect(getPlatformEngine(fakeHost({ engine: 'blink' }))).toBe('blink');
  });

  it('returns gecko when set', () => {
    expect(getPlatformEngine(fakeHost({ engine: 'gecko' }))).toBe('gecko');
  });

  it('returns webkit when set', () => {
    expect(getPlatformEngine(fakeHost({ engine: 'webkit' }))).toBe('webkit');
  });

  it('returns unknown for native backends', () => {
    expect(getPlatformEngine(fakeHost({ engine: 'unknown' }))).toBe('unknown');
  });
});

describe('getPlatformInfo', () => {
  it('fills and returns the out parameter', () => {
    const host = fakeHost({ arch: 'arm64', kind: 'mobile', name: 'ios' });
    const out = createPlatformInfo();
    expect(getPlatformInfo(host, out)).toBe(out);
    expect(out.name).toBe('ios');
    expect(out.arch).toBe('arm64');
  });
});

describe('getPlatformKind', () => {
  it('returns the host backend kind', () => {
    expect(getPlatformKind(fakeHost({ kind: 'desktop' }))).toBe('desktop');
  });
});

describe('getPlatformName', () => {
  it('returns the host backend name', () => {
    expect(getPlatformName(fakeHost({ name: 'macos' }))).toBe('macos');
  });
});

describe('getPlatformRuntime', () => {
  it('returns web when no host shell is detected', () => {
    expect(getPlatformRuntime(fakeHost({ runtime: 'web' }))).toBe('web');
  });

  it('returns electron when set', () => {
    expect(getPlatformRuntime(fakeHost({ runtime: 'electron' }))).toBe('electron');
  });

  it('returns tauri when set', () => {
    expect(getPlatformRuntime(fakeHost({ runtime: 'tauri' }))).toBe('tauri');
  });

  it('returns capacitor when set', () => {
    expect(getPlatformRuntime(fakeHost({ runtime: 'capacitor' }))).toBe('capacitor');
  });

  it('returns native when set by a native backend', () => {
    expect(getPlatformRuntime(fakeHost({ runtime: 'native' }))).toBe('native');
  });
});

describe('isPlatformDesktop', () => {
  it('is true only for desktop kind', () => {
    expect(isPlatformDesktop(fakeHost({ kind: 'desktop' }))).toBe(true);
    expect(isPlatformDesktop(fakeHost({ kind: 'web' }))).toBe(false);
  });
});

describe('isPlatformMobile', () => {
  it('is true only for mobile kind', () => {
    expect(isPlatformMobile(fakeHost({ kind: 'mobile' }))).toBe(true);
  });
});

describe('isPlatformNative', () => {
  it('is true for electron runtime', () => {
    expect(isPlatformNative(fakeHost({ runtime: 'electron' }))).toBe(true);
  });

  it('is true for tauri runtime', () => {
    expect(isPlatformNative(fakeHost({ runtime: 'tauri' }))).toBe(true);
  });

  it('is true for capacitor runtime', () => {
    expect(isPlatformNative(fakeHost({ runtime: 'capacitor' }))).toBe(true);
  });

  it('is true for native runtime', () => {
    expect(isPlatformNative(fakeHost({ runtime: 'native' }))).toBe(true);
  });

  it('is false for web runtime', () => {
    expect(isPlatformNative(fakeHost({ runtime: 'web' }))).toBe(false);
  });

  it('is false for unknown runtime', () => {
    expect(isPlatformNative(fakeHost({ runtime: 'unknown' }))).toBe(false);
  });
});

describe('isPlatformTouch', () => {
  it('reflects the backend isTouch flag', () => {
    expect(isPlatformTouch(fakeHost({ isTouch: true }))).toBe(true);
  });
});

describe('isPlatformVersionAtLeast', () => {
  it('is true when version equals minimum', () => {
    expect(isPlatformVersionAtLeast(fakeHost({ version: '14.0' }), '14.0')).toBe(true);
  });

  it('is true when version exceeds minimum', () => {
    expect(isPlatformVersionAtLeast(fakeHost({ version: '15.0' }), '14.0')).toBe(true);
  });

  it('is false when version is below minimum', () => {
    expect(isPlatformVersionAtLeast(fakeHost({ version: '13.0' }), '14.0')).toBe(false);
  });

  it('is false when version is empty (unknown)', () => {
    expect(isPlatformVersionAtLeast(fakeHost({ version: '' }), '1.0')).toBe(false);
  });

  it('handles patch-level comparison', () => {
    expect(isPlatformVersionAtLeast(fakeHost({ version: '10.15.7' }), '10.15.6')).toBe(true);
    expect(isPlatformVersionAtLeast(fakeHost({ version: '10.15.7' }), '10.15.7')).toBe(true);
    expect(isPlatformVersionAtLeast(fakeHost({ version: '10.15.7' }), '10.15.8')).toBe(false);
  });
});

describe('isPlatformWeb', () => {
  it('is true only for web kind', () => {
    expect(isPlatformWeb(fakeHost({ kind: 'web' }))).toBe(true);
  });
});

describe('R3 boundary', () => {
  it('exports no ambient-state API (setPlatformBackend, getPlatformBackend, etc.)', () => {
    const exports = Object.keys(platformContract);
    const deletedSymbols = [
      'createWebPlatformBackend',
      'explainPlatformBackend',
      'getPlatformBackend',
      'installPlatformHostBackend',
      'observePlatformHostResult',
      'resetPlatformBackendForTest',
      'setPlatformBackend',
    ];
    for (const symbol of deletedSymbols) {
      expect(exports).not.toContain(symbol);
    }
  });
});
