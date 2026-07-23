import { createStandardPbrMaterial, createUnlitMaterial } from '@flighthq/materials';
import { createTexture } from '@flighthq/texture';
import type { Material, Texture } from '@flighthq/types';
import { EntityRuntimeKey, StandardPbrMaterialKind, UnlitMaterialKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  createSceneMaterialTextureRegistry,
  getSceneMaterialTextures,
  registerBuiltInSceneMaterialTextures,
  registerSceneMaterialTextures,
} from './sceneMaterialTextureRegistry';

describe('createSceneMaterialTextureRegistry', () => {
  it('creates an empty registry', () => {
    const registry = createSceneMaterialTextureRegistry();
    expect(EntityRuntimeKey in registry).toBe(true);
    expect(registry.listers.size).toBe(0);
  });
});

describe('getSceneMaterialTextures', () => {
  it('appends nothing for an unregistered kind', () => {
    const registry = createSceneMaterialTextureRegistry();
    const out: Texture[] = [];
    getSceneMaterialTextures(registry, createUnlitMaterial(), out);
    expect(out).toHaveLength(0);
  });

  it('accumulates across calls without clearing out', () => {
    const registry = createSceneMaterialTextureRegistry();
    registerBuiltInSceneMaterialTextures(registry);
    const a = createTexture();
    const b = createTexture();
    const out: Texture[] = [];
    getSceneMaterialTextures(registry, createUnlitMaterial({ baseColorMap: a }), out);
    getSceneMaterialTextures(registry, createUnlitMaterial({ baseColorMap: b }), out);
    expect(out).toEqual([a, b]);
  });
});

describe('registerBuiltInSceneMaterialTextures', () => {
  it('registers the standard-pbr and unlit listers', () => {
    const registry = createSceneMaterialTextureRegistry();
    registerBuiltInSceneMaterialTextures(registry);
    expect(registry.listers.has(StandardPbrMaterialKind)).toBe(true);
    expect(registry.listers.has(UnlitMaterialKind)).toBe(true);
  });

  it('lists every non-null standard-pbr texture slot and skips null ones', () => {
    const registry = createSceneMaterialTextureRegistry();
    registerBuiltInSceneMaterialTextures(registry);
    const baseColorMap = createTexture();
    const normalMap = createTexture();
    const material = createStandardPbrMaterial({ baseColorMap, normalMap });
    const out: Texture[] = [];
    getSceneMaterialTextures(registry, material, out);
    expect(out).toContain(baseColorMap);
    expect(out).toContain(normalMap);
    expect(out).toHaveLength(2);
  });

  it('lists the unlit base-color slot', () => {
    const registry = createSceneMaterialTextureRegistry();
    registerBuiltInSceneMaterialTextures(registry);
    const baseColorMap = createTexture();
    const out: Texture[] = [];
    getSceneMaterialTextures(registry, createUnlitMaterial({ baseColorMap }), out);
    expect(out).toEqual([baseColorMap]);
  });
});

describe('registerSceneMaterialTextures', () => {
  it('binds a lister for a custom kind', () => {
    const registry = createSceneMaterialTextureRegistry();
    const custom = createTexture();
    registerSceneMaterialTextures(registry, 'acme.Custom', (_material: Readonly<Material>, out: Texture[]) => {
      out.push(custom);
    });
    const out: Texture[] = [];
    getSceneMaterialTextures(registry, { kind: 'acme.Custom' } as unknown as Material, out);
    expect(out).toEqual([custom]);
  });

  it('is last-write-wins with no guard', () => {
    const registry = createSceneMaterialTextureRegistry();
    const first = createTexture();
    const second = createTexture();
    registerSceneMaterialTextures(registry, UnlitMaterialKind, (_m, out) => out.push(first));
    registerSceneMaterialTextures(registry, UnlitMaterialKind, (_m, out) => out.push(second));
    const out: Texture[] = [];
    getSceneMaterialTextures(registry, createUnlitMaterial(), out);
    expect(out).toEqual([second]);
  });
});
