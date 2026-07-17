import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { createEmissiveModifier, createRimModifier, createShadedMaterial } from '@flighthq/shading';
import type { Camera, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';
import { ShadedMaterialKind } from '@flighthq/types';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import { setGlSceneTime } from './glSceneTime';
import { registerBuiltInGlModifierSnippets } from './glShadedBuiltInModifiers';
import { registerShadedGlMaterial, shadedGlMeshMaterialRenderer } from './shadedGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  const data = new Float32Array(12);
  data[1] = -1;
  data[4] = 1;
  data[5] = 1;
  data[6] = 1;
  data[8] = 0.1;
  data[9] = 0.1;
  data[10] = 0.1;
  return { ambientCount: 1, data, directionalCount: 1, hemisphereCount: 0, pointCount: 0, spotCount: 0, version: 1 };
}

function makeProxy(): SceneRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createShadedMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerShadedGlMaterial', () => {
  it('installs the renderer for ShadedMaterialKind', () => {
    const { state } = makeGlSceneState();
    registerShadedGlMaterial(state);
    expect(getGlMeshMaterialRenderer(state, ShadedMaterialKind)).toBe(shadedGlMeshMaterialRenderer);
  });
});

describe('shadedGlMeshMaterialRenderer', () => {
  it('bind selects a program and uploads camera + light block + base colors + time', () => {
    const { state, gl } = makeGlSceneState();
    shadedGlMeshMaterialRenderer.bind(state, createShadedMaterial(), makeLights(), makeCamera());

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    // Light block (2 vec4) + diffuse + specular colors → at least 4 uniform4f.
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBeGreaterThanOrEqual(4);
    // u_time is a uniform1f uploaded every bind.
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(true);
  });

  it('bind caches the program under the shaded: namespace', () => {
    const { state } = makeGlSceneState();
    shadedGlMeshMaterialRenderer.bind(state, createShadedMaterial(), makeLights(), makeCamera());
    const keys = [...getGlSceneRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('shaded:'))).toBe(true);
  });

  it('a plain ShadedMaterial (empty stack) compiles the lean base variant', () => {
    const { state } = makeGlSceneState();
    shadedGlMeshMaterialRenderer.bind(state, createShadedMaterial(), makeLights(), makeCamera());
    const keys = [...getGlSceneRuntime(state).programCache.keys()];
    // Empty modifier feature-set → the define-key trails with an empty modifier segment.
    expect(keys).toContain('shaded:----|');
  });

  it('binds modifier uniforms for a material carrying a modifier stack', () => {
    const { state, gl } = makeGlSceneState();
    registerBuiltInGlModifierSnippets(state);
    setGlSceneTime(state, 1.5);
    const material = createShadedMaterial({
      modifiers: [createEmissiveModifier({ color: 0xffcc88ff }), createRimModifier({ color: 0x88ccffff })],
    });
    shadedGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    // Emissive color + rim color each upload a uniform3f (vec3), on top of camera/ambient vec3s.
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBeGreaterThanOrEqual(4);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    shadedGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    shadedGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    const drawCall = gl.calls.find((c) => c.name === 'drawElements');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    shadedGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
