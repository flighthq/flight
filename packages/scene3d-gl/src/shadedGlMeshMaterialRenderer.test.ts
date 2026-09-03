import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { createEmissiveModifier, createRimModifier, createShadedMaterial } from '@flighthq/shading/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { ShadedMaterialKind } from '@flighthq/types/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { setGlScene3DTime } from './glScene3DTime';
import { registerBuiltInGlModifierSnippets } from './glShadedBuiltInModifiers';
import { registerGlShadedMaterial, shadedGlMeshMaterialRenderer } from './shadedGlMeshMaterialRenderer';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): Scene3DLightBlock {
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

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createShadedMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerGlShadedMaterial', () => {
  it('installs the renderer for ShadedMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlShadedMaterial(state);
    expect(getGlMeshMaterialRenderer(state, ShadedMaterialKind)).toBe(shadedGlMeshMaterialRenderer);
  });
});

describe('shadedGlMeshMaterialRenderer', () => {
  it('bind selects a program and uploads camera + light block + base colors + time', () => {
    const { state, gl } = makeGlScene3DState();
    shadedGlMeshMaterialRenderer.bind(state, createShadedMaterial(), makeLights(), makeCamera());

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    // Light block (2 vec4) + diffuse + specular colors → at least 4 uniform4f.
    expect(gl.calls.filter((c) => c.name === 'uniform4f').length).toBeGreaterThanOrEqual(4);
    // u_time is a uniform1f uploaded every bind.
    expect(gl.calls.some((c) => c.name === 'uniform1f')).toBe(true);
  });

  it('bind caches the program under the shaded: namespace', () => {
    const { state } = makeGlScene3DState();
    shadedGlMeshMaterialRenderer.bind(state, createShadedMaterial(), makeLights(), makeCamera());
    const keys = [...getGlScene3DRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('shaded:'))).toBe(true);
  });

  it('a plain ShadedMaterial (empty stack) compiles the lean base variant', () => {
    const { state } = makeGlScene3DState();
    shadedGlMeshMaterialRenderer.bind(state, createShadedMaterial(), makeLights(), makeCamera());
    const keys = [...getGlScene3DRuntime(state).programCache.keys()];
    // Empty modifier feature-set → the define-key trails with an empty modifier segment. The last two
    // base flags are the (unset) uv-transform and skin flags.
    expect(keys).toContain('shaded:-------||registry:0');
  });

  it('binds modifier uniforms for a material carrying a modifier stack', () => {
    const { state, gl } = makeGlScene3DState();
    registerBuiltInGlModifierSnippets(state);
    setGlScene3DTime(state, 1.5);
    const material = createShadedMaterial({
      modifiers: [createEmissiveModifier({ color: 0xffcc88ff }), createRimModifier({ color: 0x88ccffff })],
    });
    shadedGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    // Emissive color + rim color each upload a uniform3f (vec3), on top of camera/ambient vec3s.
    expect(gl.calls.filter((c) => c.name === 'uniform3f').length).toBeGreaterThanOrEqual(4);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    shadedGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    shadedGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());

    const drawCall = gl.calls.find((c) => c.name === 'drawElements');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlScene3DState();
    shadedGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
