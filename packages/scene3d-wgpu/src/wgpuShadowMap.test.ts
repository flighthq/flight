import { configureDirectionalShadowCamera3D, createCamera3D } from '@flighthq/camera/contract';
import { createAabb, createVector3 } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { Camera3D, Scene3DLightsLike, Node3D } from '@flighthq/types/contract';

import { drawWgpuScene3D } from './drawWgpuScene3D';
import { registerWgpuStandardPbrMaterial } from './registerWgpuStandardPbrMaterial';
import { buildWgpuPbrStandardDefineKey } from './standardPbrWgpuMeshMaterialRenderer';
import { getWgpuClassicModuleSourceForKey } from './wgpuClassicPrelude';
import { getWgpuPbrModuleSourceForKey } from './wgpuPbrPrelude';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { destroyWgpuScene3DShadow, drawWgpuScene3DShadowMap } from './wgpuShadowMap';

const LIGHTS: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

function makeShadowCamera(): Camera3D {
  // The projection is overwritten by configureDirectionalShadowCamera3D (to orthographic); start perspective.
  const camera = createCamera3D({
    far: 10,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  configureDirectionalShadowCamera3D(camera, { x: 0, y: -1, z: -1 }, createAabb(-1, -1, -1, 1, 1, 1));
  return camera;
}

function makeShadowScene3D(): Node3D {
  const scene = createNode3D(Node3DKind);
  addNodeChild(scene, createMesh(createBoxMeshGeometry(), []));
  return scene;
}

describe('destroyWgpuScene3DShadow', () => {
  it('destroys the shadow depth texture and clears the slot', () => {
    const { state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera());

    const runtime = getWgpuScene3DRuntime(state);
    expect(runtime.shadow).not.toBeNull();
    let destroyed = false;
    runtime.shadow!.depthTexture.destroy = () => {
      destroyed = true;
    };

    destroyWgpuScene3DShadow(state);
    expect(destroyed).toBe(true);
    expect(runtime.shadow).toBeNull();
    expect(runtime.shadowDepthPipeline).toBeNull();
  });

  it('is a no-op when no shadow was drawn', () => {
    const { state } = makeWgpuScene3DState();
    expect(() => destroyWgpuScene3DShadow(state)).not.toThrow();
  });
});

describe('drawWgpuScene3DShadowMap', () => {
  it('creates a sampleable depth32float shadow map and stores it on the runtime', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera());

    const depthCreate = fake.calls.find(
      (c) => c.name === 'createTexture' && (c.args[0] as GPUTextureDescriptor).format === 'depth32float',
    );
    expect(depthCreate).toBeDefined();

    const runtime = getWgpuScene3DRuntime(state);
    expect(runtime.shadow).not.toBeNull();
    expect(runtime.shadow!.matrix.m.some((v) => v !== 0)).toBe(true);
  });

  it('opens a depth-only pass and renders each caster mesh depth', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera());

    expect(fake.calls.some((c) => c.name === 'beginRenderPass')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'end')).toBe(true);
  });

  it('compiles a vertex-only depth module with the GL->WebGPU depth remap', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera());

    const shaderCall = fake.calls.find(
      (c) => c.name === 'createShaderModule' && String((c.args[0] as { code: string }).code).includes('draw.world'),
    );
    expect(shaderCall).toBeDefined();
    const code = (shaderCall!.args[0] as { code: string }).code;
    expect(code).toContain('clip.z = (clip.z + clip.w) * 0.5');
    expect(code).not.toContain('fs_main');
  });

  it('reuses the shadow depth texture across frames', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = makeShadowScene3D();
    const camera = makeShadowCamera();
    drawWgpuScene3DShadowMap(state, scene, camera);
    drawWgpuScene3DShadowMap(state, scene, camera);
    const depthCreates = fake.calls.filter(
      (c) => c.name === 'createTexture' && (c.args[0] as GPUTextureDescriptor).format === 'depth32float',
    ).length;
    expect(depthCreates).toBe(1);
  });

  it('is a no-op when no command encoder is active', () => {
    const { fake, state } = makeWgpuScene3DState();
    getWgpuRenderStateRuntime(state).commandEncoder = null;
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera());
    expect(fake.calls.some((c) => c.name === 'beginRenderPass')).toBe(false);
    expect(getWgpuScene3DRuntime(state).shadow).toBeNull();
  });

  it('binds a group(3) shadow group on the lit PBR draw that follows', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera());

    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
    });
    drawWgpuScene3D(state, scene, camera, LIGHTS);

    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(true);
  });
});

// The lit WGSL string surface: both PBR and classic declare the group(3) shadow bindings and apply the
// PCF comparison to their directional terms, mirroring scene-gl.
describe('wgpuPbrPrelude shadow sampling', () => {
  it('declares the group(3) shadow bindings and PCF comparison', () => {
    const code = getWgpuPbrModuleSourceForKey(buildWgpuPbrStandardDefineKey(null, null));
    expect(code).toContain('@group(3) @binding(0) var<uniform> shadow');
    expect(code).toContain('var shadowMap : texture_depth_2d');
    expect(code).toContain('var shadowSampler : sampler_comparison');
    expect(code).toContain('fn sampleDirectionalShadow');
    expect(code).toContain('textureSampleCompareLevel(shadowMap, shadowSampler');
    expect(code).toContain('direct * sampleDirectionalShadow(in.worldPosition)');
  });

  it('classic prelude samples the shadow map on the directional term (mirrors scene-gl classic)', () => {
    const code = getWgpuClassicModuleSourceForKey({
      alphaMaskEnabled: false,
      doubleSided: false,
      hasAlphaMap: false,
      hasDiffuseMap: false,
      hasNormalMap: false,
      hasSpecularMap: false,
      lightingModel: 'lambert',
    });
    expect(code).toContain('@group(3) @binding(1) var shadowMap : texture_depth_2d');
    expect(code).toContain('fn sampleDirectionalShadow');
    expect(code).toContain('direct * sampleDirectionalShadow(in.worldPosition)');
  });
});
