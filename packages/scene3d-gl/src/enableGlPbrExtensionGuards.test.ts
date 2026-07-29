import { createCamera3D } from '@flighthq/camera/contract';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import {
  createAnisotropyPbrExtension,
  createClearcoatPbrExtension,
  createExtendedPbrMaterial,
} from '@flighthq/materials/contract';
import type { Camera3D, Scene3DLightBlock } from '@flighthq/types/contract';

import { areGlPbrExtensionGuardsEnabled, enableGlPbrExtensionGuards } from './enableGlPbrExtensionGuards';
import { extendedPbrGlMeshMaterialRenderer } from './extendedPbrGlMeshMaterialRenderer';
import { registerGlPbrExtension } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

const NO_LIGHTS: Scene3DLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

function createCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function getGuardMessages(material: ReturnType<typeof createExtendedPbrMaterial>): string[] {
  const { state } = makeGlScene3DState();
  enableGlPbrExtensionGuards(state);
  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    extendedPbrGlMeshMaterialRenderer.bind(state, material, NO_LIGHTS, createCamera());
    return getMemoryLogSinkEntries(sink).map((entry) => String((entry.data as Record<string, unknown>).message));
  } finally {
    removeLogSink(sink.sink);
  }
}

describe('areGlPbrExtensionGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlScene3DState();
    expect(areGlPbrExtensionGuardsEnabled(state)).toBe(false);
    enableGlPbrExtensionGuards(state);
    expect(areGlPbrExtensionGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlPbrExtensionGuards', () => {
  it('warns with the registration fix when an extension kind is missing', () => {
    const messages = getGuardMessages(createExtendedPbrMaterial({ extensions: [createAnisotropyPbrExtension()] }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('registerGlPbrExtension');
  });

  it('warns when the material repeats an extension kind', () => {
    const extension = createAnisotropyPbrExtension();
    const messages = getGuardMessages(createExtendedPbrMaterial({ extensions: [extension, extension] }));
    expect(messages).toHaveLength(1);
    expect(messages.some((message) => message.includes('at most once'))).toBe(true);
  });

  it('stays silent when every extension has one supported registration', () => {
    const { state } = makeGlScene3DState();
    enableGlPbrExtensionGuards(state);
    registerGlPbrExtension(state, createClearcoatPbrExtension().kind, {
      bind(): void {},
      createShaderContribution: () => ({
        applySurface: '',
        contributeIbl: '',
        contributePunctual: '',
        finalize: '',
        fragmentDeclarations: '',
        fragmentFunctions: '',
        key: 'ok',
        textureCount: 0,
      }),
      isSupported: () => true,
    });
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      extendedPbrGlMeshMaterialRenderer.bind(
        state,
        createExtendedPbrMaterial({ extensions: [createClearcoatPbrExtension()] }),
        NO_LIGHTS,
        createCamera(),
      );
      expect(getMemoryLogSinkEntries(sink)).toHaveLength(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
