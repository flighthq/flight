import { createCamera } from '@flighthq/camera';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import type { Camera, Matrix3, Matrix4, SceneLightBlock, SceneRenderProxy } from '@flighthq/types';

import { makeGlSceneState } from './glSceneTestHelper';
import { standardPbrGlMeshMaterialRenderer } from './standardPbrGlMeshMaterialRenderer';

function makeCamera(): Camera {
  return createCamera({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

function makeLights(): SceneLightBlock {
  // Directional { dir.xyz @0, _pad, radiance.rgb @4, _pad } + ambient { radiance.rgb @8 }.
  const data = new Float32Array(12);
  data[0] = 0;
  data[1] = -1;
  data[2] = 0;
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
    material: createStandardPbrMaterial(),
    normalMatrix: createMatrix3() as Matrix3,
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4() as Matrix4,
  };
}

describe('standardPbrGlMeshMaterialRenderer', () => {
  it('bind selects a program, sets depth/cull state, and uploads camera + light + material uniforms', () => {
    const { state, gl } = makeGlSceneState();
    standardPbrGlMeshMaterialRenderer.bind(state, createStandardPbrMaterial(), makeLights(), makeCamera());

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'depthFunc' && c.args[0] === gl.LESS)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.CULL_FACE)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('bind disables back-face culling for a double-sided material', () => {
    const { state, gl } = makeGlSceneState();
    const material = createStandardPbrMaterial();
    material.doubleSided = true;
    standardPbrGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    expect(gl.calls.some((c) => c.name === 'disable' && c.args[0] === gl.CULL_FACE)).toBe(true);
  });

  it('draw uploads geometry and issues an indexed draw over the subset range', () => {
    const { state, gl } = makeGlSceneState();
    const proxy = makeProxy();
    const geometry = createBoxMeshGeometry();
    standardPbrGlMeshMaterialRenderer.bind(state, proxy.material, makeLights(), makeCamera());
    standardPbrGlMeshMaterialRenderer.draw(state, proxy, geometry);

    const drawCall = gl.calls.find((c) => c.name === 'drawElements');
    expect(drawCall).toBeDefined();
    expect(drawCall!.args[1]).toBe(proxy.subset.indexCount);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix3fv')).toBe(true);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlSceneState();
    standardPbrGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });

  it('bind uploads the full standard block including occlusion strength and emissive', () => {
    const { state, gl } = makeGlSceneState();
    const material = createStandardPbrMaterial({ metallic: 0.25, occlusionStrength: 0.7, roughness: 0.4 });
    standardPbrGlMeshMaterialRenderer.bind(state, material, makeLights(), makeCamera());
    // The standard block uploads metallic + roughness + normalScale + emissiveStrength +
    // occlusionStrength as uniform1f, so at least five scalar uploads land.
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(5);
    expect(gl.calls.some((c) => c.name === 'uniform3f')).toBe(true);
  });
});
