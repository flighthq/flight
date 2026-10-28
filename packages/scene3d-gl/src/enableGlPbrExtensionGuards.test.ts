import { createCamera3D, createPerspectiveProjection } from '@flighthq/camera/contract';
import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import {
  createAnisotropyPbrExtension,
  createClearcoatPbrExtension,
  createExtendedPbrMaterial,
} from '@flighthq/materials/contract';
import type { Camera3D, LogEntry, MemoryLogSink, Scene3DLightBlock } from '@flighthq/types/contract';

import { areGlPbrExtensionGuardsEnabled, enableGlPbrExtensionGuards } from './enableGlPbrExtensionGuards.ts';
import { glExtendedPbrMeshMaterialRenderer } from './glExtendedPbrMeshMaterialRenderer.ts';
import { registerGlPbrExtension } from './glPbrExtensionRegistry.ts';
import { makeGlScene3DState } from './glScene3DTestHelper.ts';

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
  return createCamera3D({
    far: 100,
    near: 0.1,
    projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 3 }),
  });
}

function getGuardMessages(material: ReturnType<typeof createExtendedPbrMaterial>): string[] {
  const { state } = makeGlScene3DState();
  const logState = createLogState();
  enableGlPbrExtensionGuards(state, logState);
  const sink = createMemoryLogSink(8);
  addLogSink(logState, sink.sink);
  try {
    glExtendedPbrMeshMaterialRenderer.bind(state, material, NO_LIGHTS, createCamera());
    return readMemoryLogEntries(sink).map((entry) => String((entry.data as Record<string, unknown>).message));
  } finally {
    removeLogSink(logState, sink.sink);
  }
}

describe('areGlPbrExtensionGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlScene3DState();
    expect(areGlPbrExtensionGuardsEnabled(state)).toBe(false);
    enableGlPbrExtensionGuards(state, createLogState());
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
    // Each test owns a fresh LogState, so the unregistered kind's own warning is reported here too.
    expect(messages).toHaveLength(2);
    expect(messages.some((message) => message.includes('at most once'))).toBe(true);
    expect(messages.some((message) => message.includes('registerGlPbrExtension'))).toBe(true);
  });

  it('stays silent when every extension has one supported registration', () => {
    const { state } = makeGlScene3DState();
    const logState = createLogState();
    enableGlPbrExtensionGuards(state, logState);
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
    addLogSink(logState, sink.sink);
    try {
      glExtendedPbrMeshMaterialRenderer.bind(
        state,
        createExtendedPbrMaterial({ extensions: [createClearcoatPbrExtension()] }),
        NO_LIGHTS,
        createCamera(),
      );
      expect(readMemoryLogEntries(sink)).toHaveLength(0);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

function readMemoryLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}
