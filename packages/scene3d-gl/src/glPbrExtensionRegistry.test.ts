import { createAnisotropyPbrExtension } from '@flighthq/materials/contract';
import type { GlPbrExtensionRegistration } from '@flighthq/types/contract';

import {
  bindGlPbrExtensions,
  explainGlPbrExtensions,
  getGlPbrExtensionRegistration,
  registerGlPbrExtension,
  resolveGlPbrExtensionContributions,
} from './glPbrExtensionRegistry';
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
  it('uses last-write-wins and advances the registry version', () => {
    const { state } = makeGlScene3DState();
    registerGlPbrExtension(state, 'VendorExtension', registration);
    registerGlPbrExtension(state, 'VendorExtension', registration);
    expect(getGlPbrExtensionRegistration(state, 'VendorExtension')).toBe(registration);
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
