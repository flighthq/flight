import type { WgpuPbrDefineKey } from './wgpuPbrPrelude';
import {
  buildWgpuPbrDefineKey,
  buildWgpuPbrDefineSource,
  getWgpuPbrModuleBody,
  getWgpuPbrModuleSourceForKey,
} from './wgpuPbrPrelude';

function key(overrides?: Partial<WgpuPbrDefineKey>): WgpuPbrDefineKey {
  return {
    alphaMaskEnabled: false,
    doubleSided: false,
    hasBaseColorMap: false,
    hasNormalMap: false,
    ...overrides,
  };
}

describe('buildWgpuPbrDefineKey', () => {
  it('produces a stable, distinct string per flag set', () => {
    expect(buildWgpuPbrDefineKey(key())).toBe('----');
    expect(buildWgpuPbrDefineKey(key({ alphaMaskEnabled: true }))).toBe('m---');
    expect(buildWgpuPbrDefineKey(key({ doubleSided: true }))).toBe('-d--');
    expect(buildWgpuPbrDefineKey(key({ hasBaseColorMap: true }))).toBe('--b-');
    expect(buildWgpuPbrDefineKey(key({ hasNormalMap: true }))).toBe('---n');
  });

  it('is identical for identical flags (cache soundness)', () => {
    expect(buildWgpuPbrDefineKey(key({ hasBaseColorMap: true }))).toBe(
      buildWgpuPbrDefineKey(key({ hasBaseColorMap: true })),
    );
  });
});

describe('buildWgpuPbrDefineSource', () => {
  it('emits a const bool flag block reflecting the key', () => {
    const source = buildWgpuPbrDefineSource(key({ hasBaseColorMap: true, doubleSided: true }));
    expect(source).toContain('const HAS_BASE_COLOR_MAP : bool = true;');
    expect(source).toContain('const DOUBLE_SIDED : bool = true;');
    expect(source).toContain('const ALPHA_MASK : bool = false;');
    expect(source).toContain('const HAS_NORMAL_MAP : bool = false;');
  });
});

describe('getWgpuPbrModuleBody', () => {
  it('declares the entry points and bind-group structs', () => {
    const body = getWgpuPbrModuleBody();
    expect(body).toContain('fn vs_main');
    expect(body).toContain('fn fs_main');
    expect(body).toContain('struct Frame');
    expect(body).toContain('struct MaterialBlock');
    expect(body).toContain('var<uniform> frame');
  });
});

describe('getWgpuPbrModuleSourceForKey', () => {
  it('prepends the flag block to the module body', () => {
    const k = key({ hasNormalMap: true });
    const source = getWgpuPbrModuleSourceForKey(k);
    expect(source.startsWith(buildWgpuPbrDefineSource(k))).toBe(true);
    expect(source).toContain('fn fs_main');
  });
});
