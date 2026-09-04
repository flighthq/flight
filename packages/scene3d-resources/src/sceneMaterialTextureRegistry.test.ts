import {
  createAnisotropyPbrExtension,
  createExtendedPbrMaterial,
  createStandardPbrMaterial,
  createStandardPbrMaterialProperties,
  createUnlitMaterial,
} from '@flighthq/materials/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Material, Texture } from '@flighthq/types/contract';
import {
  AnisotropyPbrExtensionKind,
  EntityRuntimeKey,
  ExtendedPbrMaterialKind,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createScene3DMaterialTextureRegistry,
  getScene3DMaterialTextures,
  hasScene3DMaterialTextureLister,
  initializeScene3DMaterialTextureRegistry,
  registerExtendedPbrScene3DMaterialTextures,
  registerScene3DMaterialTextures,
  registerScene3DPbrExtensionTextures,
  registerStandardPbrScene3DMaterialTextures,
  registerUnlitScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';

describe('createScene3DMaterialTextureRegistry', () => {
  it('creates an empty registry', () => {
    const registry = createScene3DMaterialTextureRegistry();
    expect(EntityRuntimeKey in registry).toBe(true);
    expect(registry.extensionListers.size).toBe(0);
    expect(registry.listers.size).toBe(0);
  });
});

describe('getScene3DMaterialTextures', () => {
  it('appends nothing for an unregistered kind', () => {
    const registry = createScene3DMaterialTextureRegistry();
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createUnlitMaterial(), out);
    expect(out).toHaveLength(0);
  });

  it('accumulates across calls without clearing out', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerStandardPbrScene3DMaterialTextures(registry);
    registerUnlitScene3DMaterialTextures(registry);
    registerExtendedPbrScene3DMaterialTextures(registry);
    const a = createTexture();
    const b = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createUnlitMaterial({ baseColorMap: a }), out);
    getScene3DMaterialTextures(registry, createUnlitMaterial({ baseColorMap: b }), out);
    expect(out).toEqual([a, b]);
  });
});

describe('hasScene3DMaterialTextureLister', () => {
  it('separates an unregistered kind from a material that genuinely has no maps', () => {
    // getScene3DMaterialTextures appends nothing in both cases, so this is the only way to tell them
    // apart — which is what explainScene3DResourceCoverage reports through.
    const registry = createScene3DMaterialTextureRegistry();
    registerUnlitScene3DMaterialTextures(registry);
    expect(hasScene3DMaterialTextureLister(registry, UnlitMaterialKind)).toBe(true);
    expect(hasScene3DMaterialTextureLister(registry, StandardPbrMaterialKind)).toBe(false);
  });
});

describe('initializeScene3DMaterialTextureRegistry', () => {
  it('is the construction initializer of createScene3DMaterialTextureRegistry', () => {
    expect(typeof initializeScene3DMaterialTextureRegistry).toBe('function');
  });
});

describe('registerExtendedPbrScene3DMaterialTextures', () => {
  it('lists standard maps and dispatches extensions through the nested kind registry', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerExtendedPbrScene3DMaterialTextures(registry);
    const baseColorMap = createTexture();
    const anisotropyMap = createTexture();
    registerScene3DPbrExtensionTextures(registry, AnisotropyPbrExtensionKind, (extension, out) => {
      const anisotropy = extension as ReturnType<typeof createAnisotropyPbrExtension>;
      if (anisotropy.anisotropyMap !== null) out.push(anisotropy.anisotropyMap);
    });
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createExtendedPbrMaterial({
        extensions: [createAnisotropyPbrExtension({ anisotropyMap })],
        standard: createStandardPbrMaterialProperties({ baseColorMap }),
      }),
      out,
    );
    expect(out).toEqual([baseColorMap, anisotropyMap]);
  });
});

describe('registerScene3DMaterialTextures', () => {
  it('binds a lister for a custom kind', () => {
    const registry = createScene3DMaterialTextureRegistry();
    const custom = createTexture();
    registerScene3DMaterialTextures(registry, 'acme.Custom', (_material: Readonly<Material>, out: Texture[]) => {
      out.push(custom);
    });
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, { kind: 'acme.Custom' } as unknown as Material, out);
    expect(out).toEqual([custom]);
  });

  it('is last-write-wins with no guard', () => {
    const registry = createScene3DMaterialTextureRegistry();
    const first = createTexture();
    const second = createTexture();
    registerScene3DMaterialTextures(registry, UnlitMaterialKind, (_m, out) => out.push(first));
    registerScene3DMaterialTextures(registry, UnlitMaterialKind, (_m, out) => out.push(second));
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createUnlitMaterial(), out);
    expect(out).toEqual([second]);
  });
});

describe('registerScene3DPbrExtensionTextures', () => {
  it('is last-write-wins for vendor extension listers', () => {
    const registry = createScene3DMaterialTextureRegistry();
    const first = createTexture();
    const second = createTexture();
    registerScene3DPbrExtensionTextures(registry, AnisotropyPbrExtensionKind, (_extension, out) => out.push(first));
    registerScene3DPbrExtensionTextures(registry, AnisotropyPbrExtensionKind, (_extension, out) => out.push(second));
    const out: Texture[] = [];
    registry.extensionListers.get(AnisotropyPbrExtensionKind)?.(createAnisotropyPbrExtension(), out);
    expect(out).toEqual([second]);
  });
});

describe('registerStandardPbrScene3DMaterialTextures', () => {
  it('composes with the sibling doors to cover the three surface families', () => {
    // What createBuiltInScene3DResourceResolver now spells out in its own body, rather than hiding it
    // behind one registrar whose name did not say which families it covered.
    const registry = createScene3DMaterialTextureRegistry();
    registerStandardPbrScene3DMaterialTextures(registry);
    registerUnlitScene3DMaterialTextures(registry);
    registerExtendedPbrScene3DMaterialTextures(registry);
    expect(registry.listers.has(ExtendedPbrMaterialKind)).toBe(true);
    expect(registry.listers.has(StandardPbrMaterialKind)).toBe(true);
    expect(registry.listers.has(UnlitMaterialKind)).toBe(true);
  });

  it('lists every non-null standard-pbr texture slot and skips null ones', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerStandardPbrScene3DMaterialTextures(registry);
    registerUnlitScene3DMaterialTextures(registry);
    registerExtendedPbrScene3DMaterialTextures(registry);
    const baseColorMap = createTexture();
    const normalMap = createTexture();
    const material = createStandardPbrMaterial({ baseColorMap, normalMap });
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, material, out);
    expect(out).toContain(baseColorMap);
    expect(out).toContain(normalMap);
    expect(out).toHaveLength(2);
  });

  it('lists the unlit base-color slot', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerStandardPbrScene3DMaterialTextures(registry);
    registerUnlitScene3DMaterialTextures(registry);
    registerExtendedPbrScene3DMaterialTextures(registry);
    const baseColorMap = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createUnlitMaterial({ baseColorMap }), out);
    expect(out).toEqual([baseColorMap]);
  });
});
describe('registerUnlitScene3DMaterialTextures', () => {
  it('registers only the Unlit lister, leaving other kinds unlisted', () => {
    // The point of splitting the built-in bag apart: each door registers exactly the family it names,
    // so a registry holds what the caller asked for and nothing else.
    const registry = createScene3DMaterialTextureRegistry();
    registerUnlitScene3DMaterialTextures(registry);
    const baseColorMap = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createUnlitMaterial({ baseColorMap }), out);
    expect(out).toEqual([baseColorMap]);

    out.length = 0;
    getScene3DMaterialTextures(registry, createStandardPbrMaterial({ baseColorMap }), out);
    expect(out).toEqual([]);
  });
});
