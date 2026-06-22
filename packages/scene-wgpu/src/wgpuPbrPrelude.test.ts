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
    anisotropyEnabled: false,
    clearcoatEnabled: false,
    doubleSided: false,
    hasBaseColorMap: false,
    hasNormalMap: false,
    iridescenceEnabled: false,
    sheenEnabled: false,
    specularEnabled: false,
    subsurfaceEnabled: false,
    transmissionEnabled: false,
    ...overrides,
  };
}

const NONE = key();
const STANDARD_ALL = key({ alphaMaskEnabled: true, doubleSided: true, hasBaseColorMap: true, hasNormalMap: true });
const ALL = key({
  ...STANDARD_ALL,
  anisotropyEnabled: true,
  clearcoatEnabled: true,
  iridescenceEnabled: true,
  sheenEnabled: true,
  specularEnabled: true,
  subsurfaceEnabled: true,
  transmissionEnabled: true,
});

describe('buildWgpuPbrDefineKey', () => {
  it('produces a stable, distinct string per flag set', () => {
    expect(buildWgpuPbrDefineKey(NONE)).toBe('----:-------');
    expect(buildWgpuPbrDefineKey(STANDARD_ALL)).toBe('mdbn:-------');
    expect(buildWgpuPbrDefineKey(ALL)).toBe('mdbn:CSAIPUT');
    expect(buildWgpuPbrDefineKey(key({ alphaMaskEnabled: true }))).toBe('m---:-------');
    expect(buildWgpuPbrDefineKey(key({ doubleSided: true }))).toBe('-d--:-------');
    expect(buildWgpuPbrDefineKey(key({ hasBaseColorMap: true }))).toBe('--b-:-------');
    expect(buildWgpuPbrDefineKey(key({ hasNormalMap: true }))).toBe('---n:-------');
    expect(buildWgpuPbrDefineKey(key({ clearcoatEnabled: true }))).toBe('----:C------');
    expect(buildWgpuPbrDefineKey(key({ transmissionEnabled: true }))).toBe('----:------T');
  });

  it('is identical for identical flags (cache soundness)', () => {
    expect(buildWgpuPbrDefineKey(key(ALL))).toBe(buildWgpuPbrDefineKey(key(ALL)));
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

  it('emits a const for every extension lobe', () => {
    const all = buildWgpuPbrDefineSource(ALL);
    expect(all).toContain('const CLEARCOAT : bool = true;');
    expect(all).toContain('const SHEEN : bool = true;');
    expect(all).toContain('const ANISOTROPY : bool = true;');
    expect(all).toContain('const IRIDESCENCE : bool = true;');
    expect(all).toContain('const SPECULAR_EXT : bool = true;');
    expect(all).toContain('const SUBSURFACE : bool = true;');
    expect(all).toContain('const TRANSMISSION : bool = true;');

    const none = buildWgpuPbrDefineSource(NONE);
    expect(none).toContain('const CLEARCOAT : bool = false;');
    expect(none).toContain('const TRANSMISSION : bool = false;');
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

  it('includes the extension lobe helpers behind their const flags', () => {
    const body = getWgpuPbrModuleBody();
    expect(body).toContain('distributionGgxAnisotropic');
    expect(body).toContain('distributionCharlie');
    expect(body).toContain('iridescentFresnel');
    expect(body).toContain('if (CLEARCOAT)');
    expect(body).toContain('if (TRANSMISSION)');
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
