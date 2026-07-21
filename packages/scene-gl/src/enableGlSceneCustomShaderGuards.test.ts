import { createCamera3D } from '@flighthq/camera';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { createCustomShaderMaterial } from '@flighthq/materials';
import type { Camera3D, SceneLightBlock } from '@flighthq/types';

import {
  customShaderGlMeshMaterialRenderer,
  registerGlCustomMaterialShader,
} from './customShaderGlMeshMaterialRenderer';
import {
  areGlSceneCustomShaderGuardsEnabled,
  enableGlSceneCustomShaderGuards,
} from './enableGlSceneCustomShaderGuards';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';

// GL uniform-type enums the mock and the guard compare against (WebGL2 spec values).
const GL_FLOAT_MAT3 = 0x8b5b;
const GL_FLOAT_MAT4 = 0x8b5c;

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: SceneLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

const SOURCE = { fragment: 'frag', vertex: 'vert' };

// Binds a custom-shader material under `shaderKey` with the guard installed, against a fake context whose
// active uniforms are `activeUniforms`, and returns the messages the guard emitted.
function bindWithGuard(shaderKey: string, activeUniforms: readonly { name: string; type: number }[]): string[] {
  const { state } = makeGlSceneState(makeFakeGl2({ activeUniforms }));
  registerGlCustomMaterialShader(state, shaderKey, SOURCE);
  enableGlSceneCustomShaderGuards(state);

  const sink = createMemoryLogSink(8);
  addLogSink(sink.sink);
  try {
    customShaderGlMeshMaterialRenderer.bind(state, createCustomShaderMaterial({ shaderKey }), NO_LIGHTS, makeCamera());
    customShaderGlMeshMaterialRenderer.bind(state, createCustomShaderMaterial({ shaderKey }), NO_LIGHTS, makeCamera());
    return getMemoryLogSinkEntries(sink).map((e) => String((e.data as Record<string, unknown>).message));
  } finally {
    removeLogSink(sink.sink);
  }
}

describe('areGlSceneCustomShaderGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = makeGlSceneState();
    expect(areGlSceneCustomShaderGuardsEnabled(state)).toBe(false);
    enableGlSceneCustomShaderGuards(state);
    expect(areGlSceneCustomShaderGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlSceneCustomShaderGuards', () => {
  it('warns once, naming the fix, when u_normalMatrix is declared mat4 instead of mat3', () => {
    const messages = bindWithGuard('badNormalMatrix', [{ name: 'u_normalMatrix', type: GL_FLOAT_MAT4 }]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('u_normalMatrix');
    expect(messages[0]).toContain('declares u_normalMatrix as mat4');
    expect(messages[0]).toContain("Declare 'mat3 u_normalMatrix'");
  });

  it('stays silent when the built-in uniforms are declared with the expected types', () => {
    const messages = bindWithGuard('okNormalMatrix', [
      { name: 'u_normalMatrix', type: GL_FLOAT_MAT3 },
      { name: 'u_model', type: GL_FLOAT_MAT4 },
      { name: 'u_viewProjection', type: GL_FLOAT_MAT4 },
    ]);
    expect(messages).toHaveLength(0);
  });

  it('ignores non-built-in uniforms so a custom mat4 uniform is not flagged', () => {
    const messages = bindWithGuard('customUniform', [{ name: 'u_userTransform', type: GL_FLOAT_MAT4 }]);
    expect(messages).toHaveLength(0);
  });
});
