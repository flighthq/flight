import { configureDirectionalShadowCamera3D, createCamera3D } from '@flighthq/camera';
import { createAabb, createVector3 } from '@flighthq/geometry';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createMesh, createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, SceneLightsLike, SceneNode } from '@flighthq/types';

import { drawWgpuScene } from './drawWgpuScene';
import { registerStandardPbrWgpuMaterial } from './registerStandardPbrWgpuMaterial';
import { buildWgpuPbrStandardDefineKey } from './standardPbrWgpuMeshMaterialRenderer';
import { getWgpuClassicModuleSourceForKey } from './wgpuClassicPrelude';
import { getWgpuPbrModuleSourceForKey } from './wgpuPbrPrelude';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState } from './wgpuSceneTestHelper';
import { destroyWgpuSceneShadow, drawWgpuSceneShadowMap } from './wgpuShadowMap';

const LIGHTS: SceneLightsLike = {
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

function makeShadowScene(): SceneNode {
  const scene = createSceneNode(SceneNodeKind);
  addNodeChild(scene, createMesh(createBoxMeshGeometry(), []));
  return scene;
}

describe('destroyWgpuSceneShadow', () => {
  it('destroys the shadow depth texture and clears the slot', () => {
    const { state } = makeWgpuSceneState();
    drawWgpuSceneShadowMap(state, makeShadowScene(), makeShadowCamera());

    const runtime = getWgpuSceneRuntime(state);
    expect(runtime.shadow).not.toBeNull();
    let destroyed = false;
    runtime.shadow!.depthTexture.destroy = () => {
      destroyed = true;
    };

    destroyWgpuSceneShadow(state);
    expect(destroyed).toBe(true);
    expect(runtime.shadow).toBeNull();
    expect(runtime.shadowDepthPipeline).toBeNull();
  });

  it('is a no-op when no shadow was drawn', () => {
    const { state } = makeWgpuSceneState();
    expect(() => destroyWgpuSceneShadow(state)).not.toThrow();
  });
});

describe('drawWgpuSceneShadowMap', () => {
  it('creates a sampleable depth32float shadow map and stores it on the runtime', () => {
    const { fake, state } = makeWgpuSceneState();
    drawWgpuSceneShadowMap(state, makeShadowScene(), makeShadowCamera());

    const depthCreate = fake.calls.find(
      (c) => c.name === 'createTexture' && (c.args[0] as GPUTextureDescriptor).format === 'depth32float',
    );
    expect(depthCreate).toBeDefined();

    const runtime = getWgpuSceneRuntime(state);
    expect(runtime.shadow).not.toBeNull();
    expect(runtime.shadow!.matrix.m.some((v) => v !== 0)).toBe(true);
  });

  it('opens a depth-only pass and renders each caster mesh depth', () => {
    const { fake, state } = makeWgpuSceneState();
    drawWgpuSceneShadowMap(state, makeShadowScene(), makeShadowCamera());

    expect(fake.calls.some((c) => c.name === 'beginRenderPass')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'end')).toBe(true);
  });

  it('compiles a vertex-only depth module with the GL->WebGPU depth remap', () => {
    const { fake, state } = makeWgpuSceneState();
    drawWgpuSceneShadowMap(state, makeShadowScene(), makeShadowCamera());

    const shaderCall = fake.calls.find(
      (c) => c.name === 'createShaderModule' && String((c.args[0] as { code: string }).code).includes('draw.world'),
    );
    expect(shaderCall).toBeDefined();
    const code = (shaderCall!.args[0] as { code: string }).code;
    expect(code).toContain('clip.z = (clip.z + clip.w) * 0.5');
    expect(code).not.toContain('fs_main');
  });

  it('reuses the shadow depth texture across frames', () => {
    const { fake, state } = makeWgpuSceneState();
    const scene = makeShadowScene();
    const camera = makeShadowCamera();
    drawWgpuSceneShadowMap(state, scene, camera);
    drawWgpuSceneShadowMap(state, scene, camera);
    const depthCreates = fake.calls.filter(
      (c) => c.name === 'createTexture' && (c.args[0] as GPUTextureDescriptor).format === 'depth32float',
    ).length;
    expect(depthCreates).toBe(1);
  });

  it('is a no-op when no command encoder is active', () => {
    const { fake, state } = makeWgpuSceneState();
    getWgpuRenderStateRuntime(state).commandEncoder = null;
    drawWgpuSceneShadowMap(state, makeShadowScene(), makeShadowCamera());
    expect(fake.calls.some((c) => c.name === 'beginRenderPass')).toBe(false);
    expect(getWgpuSceneRuntime(state).shadow).toBeNull();
  });

  it('binds a group(3) shadow group on the lit PBR draw that follows', () => {
    const { fake, state } = makeWgpuSceneState();
    registerStandardPbrWgpuMaterial(state);
    drawWgpuSceneShadowMap(state, makeShadowScene(), makeShadowCamera());

    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
    });
    drawWgpuScene(state, scene, camera, LIGHTS);

    expect(fake.calls.some((c) => c.name === 'setBindGroup' && c.args[0] === 3)).toBe(true);
  });
});

// The lit WGSL string surface: the PBR prelude declares the group(3) shadow bindings and the PCF
// comparison mirroring scene-gl; the classic prelude — like scene-gl's classic — does NOT apply a shadow
// term (so raster parity with GL holds).
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
