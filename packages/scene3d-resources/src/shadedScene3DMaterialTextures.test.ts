import { createShadedMaterial } from '@flighthq/shading/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/types/contract';

import { createScene3DMaterialTextureRegistry, getScene3DMaterialTextures } from './sceneMaterialTextureRegistry';
import { registerShadedScene3DMaterialTextures } from './shadedScene3DMaterialTextures';

describe('registerShadedScene3DMaterialTextures', () => {
  it('lists the diffuse, normal and specular maps', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerShadedScene3DMaterialTextures(registry);
    const diffuse = createTexture();
    const normal = createTexture();
    const specular = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(
      registry,
      createShadedMaterial({ diffuseMap: diffuse, normalMap: normal, specularMap: specular }),
      out,
    );
    expect(out).toEqual([diffuse, normal, specular]);
  });

  it('skips the empty slots of a map-less material', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerShadedScene3DMaterialTextures(registry);
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createShadedMaterial(), out);
    expect(out).toEqual([]);
  });

  it('appends without clearing, so one mesh accumulates across its materials', () => {
    const registry = createScene3DMaterialTextureRegistry();
    registerShadedScene3DMaterialTextures(registry);
    const first = createTexture();
    const second = createTexture();
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createShadedMaterial({ diffuseMap: first }), out);
    getScene3DMaterialTextures(registry, createShadedMaterial({ specularMap: second }), out);
    expect(out).toEqual([first, second]);
  });

  it('appends nothing for a ShadedMaterial while unregistered', () => {
    // The registry silently ignores an unregistered kind, which is exactly why this registration exists:
    // without it an AWD2 scene's maps are never resolved and the model renders untextured.
    const registry = createScene3DMaterialTextureRegistry();
    const out: Texture[] = [];
    getScene3DMaterialTextures(registry, createShadedMaterial({ diffuseMap: createTexture() }), out);
    expect(out).toEqual([]);
  });
});
