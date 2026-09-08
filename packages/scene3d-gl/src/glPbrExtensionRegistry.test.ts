import { createMatrix3, createVector2 } from '@flighthq/geometry/contract';
import { createAnisotropyPbrExtension } from '@flighthq/materials/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createGlPipeline, getGlRenderStateRuntime, registerGlTextureResolver } from '@flighthq/render-gl/contract';
import { createTexture, getTextureUvMatrix } from '@flighthq/texture/contract';
import type { GlPbrExtensionRegistration, GlRenderTarget, TextureSource } from '@flighthq/types/contract';

import {
  bindGlPbrExtensions,
  explainGlPbrExtensions,
  getGlPbrExtensionRegistration,
  registerGlPbrExtension,
  resolveGlPbrExtensionContributions,
} from './glPbrExtensionRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

const registration: GlPbrExtensionRegistration = {
  bind(): void {},
  createShaderContribution() {
    return {
      applySurface: '',
      contributeIbl: '',
      contributePunctual: '',
      finalize: '',
      fragmentDeclarations: '',
      fragmentFunctions: '',
      key: 'vendor',
      textureCount: 0,
    };
  },
  isSupported(): boolean {
    return true;
  },
};

describe('bindGlPbrExtensions', () => {
  it('binds a resolved extension list', () => {
    const { state } = makeGlScene3DState();
    const extension = createAnisotropyPbrExtension();
    registerGlPbrExtension(state, extension.kind, registration);
    expect(bindGlPbrExtensions(state, {}, [extension])).toBe(true);
  });

  it('uploads the selected UV set and the bound texture own transform', () => {
    const { state, gl } = makeGlScene3DState();
    const extension = createAnisotropyPbrExtension();
    const texture = createTexture({
      source: { kind: 'test.ready' } as TextureSource,
      uvOffset: createVector2(0.25, 0.5),
      uvRotation: Math.PI / 4,
      uvScale: createVector2(2, 3),
    });
    const transformedRegistration: GlPbrExtensionRegistration = {
      ...registration,
      bind(context): void {
        context.bindTexture('u_map', 'u_mapUvSet', 'u_mapTransform', texture, 1);
      },
    };
    registerGlTextureResolver(state, 'test.ready', () => ({ straightAlpha: false, texture: {} as WebGLTexture }));
    registerGlPbrExtension(state, extension.kind, transformedRegistration);

    expect(bindGlPbrExtensions(state, {}, [extension])).toBe(true);

    const uvSetCall = gl.calls.find(
      (call) => call.name === 'uniform1i' && (call.args[0] as { name?: string }).name === 'u_mapUvSet',
    );
    const transformCall = gl.calls.find(
      (call) => call.name === 'uniformMatrix3fv' && (call.args[0] as { name?: string }).name === 'u_mapTransform',
    );
    const expected = createMatrix3();
    getTextureUvMatrix(expected, texture);
    expect(uvSetCall?.args[1]).toBe(1);
    expect(Array.from(transformCall?.args[2] as Float32Array)).toEqual(Array.from(expected.m));
  });
});

describe('explainGlPbrExtensions', () => {
  it('reports missing and duplicate registrations as plain data', () => {
    const { state } = makeGlScene3DState();
    const extension = createAnisotropyPbrExtension();
    expect(explainGlPbrExtensions(state, [extension, extension])).toEqual([
      { code: 'missing-registration', kind: 'AnisotropyPbrExtension' },
      { code: 'duplicate-kind', kind: 'AnisotropyPbrExtension' },
    ]);
  });

  it('reports unsupported extensions and extension texture-unit exhaustion', () => {
    const { state } = makeGlScene3DState();
    const extension = createAnisotropyPbrExtension();
    registerGlPbrExtension(state, extension.kind, {
      ...registration,
      isSupported: () => false,
    });
    expect(explainGlPbrExtensions(state, [extension])).toEqual([
      { code: 'unsupported-extension', kind: 'AnisotropyPbrExtension' },
    ]);

    registerGlPbrExtension(state, extension.kind, {
      ...registration,
      createShaderContribution: () => ({
        ...registration.createShaderContribution(
          { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
          extension,
        ),
        textureCount: 6,
      }),
    });
    expect(explainGlPbrExtensions(state, [extension])).toEqual([
      { code: 'texture-unit-exhaustion', kind: 'ExtendedPbrMaterial' },
    ]);
  });

  it('reports transmission feedback from the active render target', () => {
    const { state } = makeGlScene3DState();
    const extension = createAnisotropyPbrExtension();
    const sceneColorTexture = {} as WebGLTexture;
    registerGlPbrExtension(state, extension.kind, {
      ...registration,
      createShaderContribution: () => ({
        ...registration.createShaderContribution(
          { hasTransmissionSceneColor: () => true, isTextureReady: () => false },
          extension,
        ),
        samplesTransmissionSceneColor: true,
      }),
    });
    getGlScene3DRuntime(state).pbrTransmissionSceneColor = {
      height: 32,
      mipLevelCount: 6,
      texture: sceneColorTexture,
      width: 32,
    };
    getGlRenderStateRuntime(state).currentRenderTarget = {
      textures: [sceneColorTexture],
    } as GlRenderTarget;

    expect(explainGlPbrExtensions(state, [extension])).toEqual([
      { code: 'framebuffer-feedback', kind: 'AnisotropyPbrExtension' },
    ]);
  });
});

describe('getGlPbrExtensionRegistration', () => {
  it('returns null before registration', () => {
    const { state } = makeGlScene3DState();
    expect(getGlPbrExtensionRegistration(state, 'VendorExtension')).toBeNull();
  });
});

describe('registerGlPbrExtension', () => {
  it('replaces the persistent table and revision while an explicitly copied state retains its snapshot', () => {
    const { state: screen } = makeGlScene3DState();
    const replacement: GlPbrExtensionRegistration = { ...registration, bind(): void {} };
    registerGlPbrExtension(screen, 'VendorExtension', registration);
    const snapshot = getGlRenderStateRuntime(screen).registries.pbrExtensions;
    const { state: derived } = makeGlScene3DState(
      undefined,
      createGlPipeline(getGlRenderStateRuntime(screen).registries),
    );

    getGlScene3DRuntime(derived);
    registerGlPbrExtension(screen, 'VendorExtension', replacement);

    expect(getGlRenderStateRuntime(derived).registries.pbrExtensions).toBe(snapshot);
    expect(getGlRenderStateRuntime(derived).registries.pbrExtensionRevision).toBe(1);
    expect(getGlRenderStateRuntime(screen).registries.pbrExtensions).not.toBe(snapshot);
    expect(getGlRenderStateRuntime(screen).registries.pbrExtensionRevision).toBe(2);
    expect(getRegistryTableEntry(snapshot, 'VendorExtension')).toBe(registration);
    expect(getGlPbrExtensionRegistration(derived, 'VendorExtension')).toBe(registration);
    expect(getGlPbrExtensionRegistration(screen, 'VendorExtension')).toBe(replacement);
  });
});

describe('resolveGlPbrExtensionContributions', () => {
  it('preserves descriptor order', () => {
    const { state } = makeGlScene3DState();
    const extension = createAnisotropyPbrExtension();
    registerGlPbrExtension(state, extension.kind, registration);
    expect(resolveGlPbrExtensionContributions(state, [extension])?.map((value) => value.key)).toEqual(['vendor']);
  });
});
