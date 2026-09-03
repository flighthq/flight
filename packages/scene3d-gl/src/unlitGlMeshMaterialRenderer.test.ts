import { createCamera3D } from '@flighthq/camera/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import { createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import {
  getGlRenderStateRuntime,
  registerGlImageTextureResolver,
  registerGlRenderTextureResolver,
} from '@flighthq/render-gl/contract';
import { advanceVideoTexture, createRenderTexture, createVideoTexture } from '@flighthq/texture/contract';
import type { Camera3D, Scene3DLightBlock, Scene3DRenderProxy } from '@flighthq/types/contract';
import { UnlitMaterialKind } from '@flighthq/types/contract';
import { createVideoResource } from '@flighthq/video/contract';

import { getGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerGlUnlitMaterial, unlitGlMeshMaterialRenderer } from './unlitGlMeshMaterialRenderer';

function makeCamera(): Camera3D {
  return createCamera3D({ far: 100, near: 0.1, projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' } });
}

const NO_LIGHTS: Scene3DLightBlock = {
  ambientCount: 0,
  data: new Float32Array(12),
  directionalCount: 0,
  hemisphereCount: 0,
  pointCount: 0,
  spotCount: 0,
  version: 1,
};

function makeProxy(): Scene3DRenderProxy {
  const geometry = createBoxMeshGeometry();
  return {
    material: createUnlitMaterial(),
    normalMatrix: createMatrix3(),
    subset: geometry.subsets[0],
    worldMatrix: createMatrix4(),
  };
}

describe('registerGlUnlitMaterial', () => {
  it('installs the renderer for UnlitMaterialKind', () => {
    const { state } = makeGlScene3DState();
    registerGlUnlitMaterial(state);
    expect(getGlMeshMaterialRenderer(state, UnlitMaterialKind)).toBe(unlitGlMeshMaterialRenderer);
  });
});

describe('unlitGlMeshMaterialRenderer', () => {
  it('bind selects a program, sets depth/cull, view-projection, and the color uniform', () => {
    const { state, gl } = makeGlScene3DState();
    unlitGlMeshMaterialRenderer.bind(state, createUnlitMaterial(), NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === gl.DEPTH_TEST)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniformMatrix4fv')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
  });

  it('binds a ready dynamic video map into the color-map slot', () => {
    const { state, gl } = makeGlScene3DState();
    const material = createUnlitMaterial();
    material.baseColorMap = createVideoTexture(
      createVideoResource({ readyState: 4, videoHeight: 120, videoWidth: 160 } as HTMLVideoElement),
    );
    material.baseColorMap.sampler.mipmaps = false;
    advanceVideoTexture(material.baseColorMap);
    registerGlUnlitMaterial(state);
    registerGlImageTextureResolver(state);
    getGlRenderStateRuntime(state).context.anisotropyExt = null;
    unlitGlMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(true);
  });

  it('handles an unrendered render Texture in the same color-map slot without an upload', () => {
    const { state, gl } = makeGlScene3DState();
    const material = createUnlitMaterial();
    material.baseColorMap = createRenderTexture({ height: 16, width: 16 });
    material.baseColorMap.sampler.mipmaps = false;
    registerGlUnlitMaterial(state);
    registerGlRenderTextureResolver(state);
    getGlRenderStateRuntime(state).context.anisotropyExt = null;
    const uploads = gl.calls.filter((call) => call.name === 'texImage2D').length;

    unlitGlMeshMaterialRenderer.bind(state, material, NO_LIGHTS, makeCamera());

    expect(gl.calls.filter((call) => call.name === 'texImage2D')).toHaveLength(uploads);
    expect(gl.calls.some((call) => call.name === 'bindTexture' && call.args[1] === null)).toBe(true);
  });

  it('draw issues an indexed draw over the subset after bind', () => {
    const { state, gl } = makeGlScene3DState();
    const proxy = makeProxy();
    unlitGlMeshMaterialRenderer.bind(state, proxy.material, NO_LIGHTS, makeCamera());
    unlitGlMeshMaterialRenderer.draw(state, proxy, createBoxMeshGeometry());
    const draw = gl.calls.find((c) => c.name === 'drawElements');
    expect(draw).toBeDefined();
    expect(draw!.args[1]).toBe(proxy.subset.indexCount);
  });

  it('draw is a no-op when bind has not selected a program', () => {
    const { state, gl } = makeGlScene3DState();
    unlitGlMeshMaterialRenderer.draw(state, makeProxy(), createBoxMeshGeometry());
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });
});
