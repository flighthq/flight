import { createAnisotropyPbrExtension } from '@flighthq/materials/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createGlPipeline, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { GlPbrExtensionRegistration } from '@flighthq/types/contract';

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
