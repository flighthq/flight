import type { Scene3DRequirement } from '@flighthq/types/contract';
import { RenderBackend, Scene3DRegistry } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { formatScene3DRequirements } from './sceneRequirementText';

describe('formatScene3DRequirements', () => {
  it('names the backend-prefixed material registrar the naming law guarantees', () => {
    const requirements: Scene3DRequirement[] = [{ key: 'ShadedMaterial', registry: Scene3DRegistry.MaterialRenderer }];
    expect(formatScene3DRequirements(requirements, RenderBackend.Gl)).toContain('registerGlShadedMaterial(state)');
    expect(formatScene3DRequirements(requirements, RenderBackend.Wgpu)).toContain('registerWgpuShadedMaterial(state)');
  });

  it('states that no register-all exists, so a reader does not go looking for one', () => {
    const text = formatScene3DRequirements(
      [{ key: 'ShadedMaterial', registry: Scene3DRegistry.MaterialRenderer }],
      RenderBackend.Gl,
    );
    expect(text).toContain('no register-all');
  });

  it('says so plainly when there is nothing to register', () => {
    expect(formatScene3DRequirements([], RenderBackend.Gl)).toBe('Scene3D content requires no registrations.');
  });

  it('reports the modifier gap on the backends that compile no shaders', () => {
    const requirements: Scene3DRequirement[] = [{ key: 'Rim', registry: Scene3DRegistry.ModifierSnippet }];
    expect(formatScene3DRequirements(requirements, RenderBackend.Gl)).toContain(
      "registerGlModifierSnippet(state, 'Rim', snippet)",
    );
    for (const backend of [RenderBackend.Canvas, RenderBackend.Dom]) {
      const text = formatScene3DRequirements(requirements, backend);
      expect(text).toContain('UNAVAILABLE');
      // The line must not invent registerCanvasModifierSnippet / registerDomModifierSnippet.
      expect(text).not.toContain(`register${backend}ModifierSnippet`);
    }
  });

  it('routes the texture resolver line to each backend’s real registrar', () => {
    const requirements: Scene3DRequirement[] = [{ key: 'image', registry: Scene3DRegistry.TextureResolver }];
    expect(formatScene3DRequirements(requirements, RenderBackend.Gl)).toContain(
      'registerStandardGlTextureResolvers(state)',
    );
    expect(formatScene3DRequirements(requirements, RenderBackend.Canvas)).toContain('registerCanvasTextureResolver(');
    const dom = formatScene3DRequirements(requirements, RenderBackend.Dom);
    expect(dom).toContain('registerDomTextureResolver(');
    // No Standard* convenience ships for Canvas or DOM, and naming one would send a reader hunting.
    expect(dom).not.toContain('registerStandardDomTextureResolvers');
    expect(formatScene3DRequirements(requirements, RenderBackend.Canvas)).not.toContain(
      'registerStandardCanvasTextureResolvers',
    );
  });

  it('names the open lister primitive, which is correct for a vendor-prefixed kind too', () => {
    const text = formatScene3DRequirements(
      [{ key: 'acme.Foo', registry: Scene3DRegistry.MaterialTextureLister }],
      RenderBackend.Gl,
    );
    expect(text).toContain("registerScene3DMaterialTextures(registry, 'acme.Foo', lister)");
  });

  it('offers both the single and built-in forms for a shading modifier and an image decoder', () => {
    const text = formatScene3DRequirements(
      [
        { key: 'image/png', registry: Scene3DRegistry.ImageDecoder },
        { key: 'Rim', registry: Scene3DRegistry.ShadingModifier },
      ],
      RenderBackend.Gl,
    );
    expect(text).toContain("registerImageDecoder('image/png', decoder)");
    expect(text).toContain('registerWebImageDecoders()');
    expect(text).toContain('registerModifier(registry, ...)');
    expect(text).toContain('registerBuiltInModifiers(registry)');
  });

  it('emits one line per requirement under the two-line header', () => {
    const text = formatScene3DRequirements(
      [
        { key: 'image/png', registry: Scene3DRegistry.ImageDecoder },
        { key: 'ShadedMaterial', registry: Scene3DRegistry.MaterialRenderer },
      ],
      RenderBackend.Gl,
    );
    expect(text.split('\n')).toHaveLength(4);
  });
});
