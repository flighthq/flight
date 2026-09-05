import {
  configureDirectionalShadowCamera3D,
  createCamera3D,
  createOrthographicProjection,
  getOrthographicProjectionTexelSize,
} from '@flighthq/camera/contract';
import { createAabb, createMatrix4, createVector3 } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  createBoxMeshGeometry,
  createMeshGeometry,
} from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import {
  createInstancedMesh,
  createMesh,
  createNode3D,
  Node3DKind,
  setInstancedMeshInstanceCount,
  setInstancedMeshInstanceMatrix,
} from '@flighthq/scene3d/contract';
import type { Camera3D, Scene3DLightsLike, Node3D, Skeleton3D } from '@flighthq/types/contract';
import { DIRECTIONAL_SHADOW_MAP_SIZE } from '@flighthq/types/contract';

import { drawWgpuScene3D } from './drawWgpuScene3D';
import { registerWgpuStandardPbrMaterial } from './registerWgpuStandardPbrMaterial';
import { buildWgpuPbrStandardDefineKey } from './standardPbrWgpuMeshMaterialRenderer';
import { getWgpuClassicModuleSourceForKey } from './wgpuClassicPrelude';
import { WGPU_DIRECTIONAL_SHADOW_WGSL } from './wgpuMeshPipeline';
import { getWgpuPbrModuleSourceForKey } from './wgpuPbrPrelude';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';
import { destroyWgpuScene3DShadow, drawWgpuScene3DShadowMap } from './wgpuShadowMap';
import { registerWgpuGpuSkinning } from './wgpuSkinPalette';

const LIGHTS: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({
    castsShadow: true,
    color: 0xffffffff,
    direction: createVector3(0, -1, -1),
    intensity: 1,
  }),
};
const SHADOW_LIGHT = LIGHTS.directional!;

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

function shadowTranslation(x: number) {
  const matrix = createMatrix4();
  matrix.m[12] = x;
  return matrix;
}

function makeShadowScene3D(): Node3D {
  const scene = createNode3D(Node3DKind);
  addNodeChild(scene, createMesh(createBoxMeshGeometry(), []));
  return scene;
}

describe('destroyWgpuScene3DShadow', () => {
  it('destroys the shadow depth texture and clears the slot', () => {
    const { state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera(), SHADOW_LIGHT);

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
  it('does not allocate or render when the directional light has shadows disabled', () => {
    const { fake, state } = makeWgpuScene3DState();

    drawWgpuScene3DShadowMap(
      state,
      makeShadowScene3D(),
      makeShadowCamera(),
      createDirectionalLight({ castsShadow: false }),
    );

    expect(getWgpuScene3DRuntime(state).shadow).toBeNull();
    expect(fake.calls.some((call) => call.name === 'beginRenderPass')).toBe(false);
    expect(
      fake.calls.some(
        (call) => call.name === 'createTexture' && (call.args[0] as GPUTextureDescriptor).format === 'depth32float',
      ),
    ).toBe(false);
  });

  it('treats an absent directional light as disabled and invalidates a retained shadow', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = makeShadowScene3D();
    const camera = makeShadowCamera();
    drawWgpuScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);
    const passCount = fake.calls.filter((call) => call.name === 'beginRenderPass').length;

    drawWgpuScene3DShadowMap(state, scene, camera, null);

    expect(getWgpuScene3DRuntime(state).shadow!.enabled).toBe(false);
    expect(fake.calls.filter((call) => call.name === 'beginRenderPass')).toHaveLength(passCount);
  });

  it('creates a sampleable depth32float shadow map and stores it on the runtime', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera(), SHADOW_LIGHT);

    const depthCreate = fake.calls.find(
      (c) => c.name === 'createTexture' && (c.args[0] as GPUTextureDescriptor).format === 'depth32float',
    );
    expect(depthCreate).toBeDefined();

    const runtime = getWgpuScene3DRuntime(state);
    expect(runtime.shadow).not.toBeNull();
    expect(runtime.shadow!.matrix.m.some((v) => v !== 0)).toBe(true);
  });

  it('records normalized PCF and receiver-bias configuration on the runtime', () => {
    const { state } = makeWgpuScene3DState();
    const light = createDirectionalLight({
      castsShadow: true,
      normalBias: 0.02,
      pcfRadius: 8.7,
      shadowBias: 0.01,
    });

    const camera = makeShadowCamera();
    if (camera.projection.kind !== 'orthographic') throw new Error('test shadow camera must be orthographic');
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), camera, light);

    expect(getWgpuScene3DRuntime(state).shadow).toEqual(
      expect.objectContaining({
        enabled: true,
        normalBiasWorld:
          0.02 *
          getOrthographicProjectionTexelSize(
            camera.projection,
            DIRECTIONAL_SHADOW_MAP_SIZE,
            DIRECTIONAL_SHADOW_MAP_SIZE,
          ),
        pcfRadius: 2,
        shadowBias: 0.01,
      }),
    );
  });

  it('scales authored normal-bias texels with the orthographic shadow projection', () => {
    const light = createDirectionalLight({ castsShadow: true, normalBias: 1 });
    const camera = makeShadowCamera();
    const wideCamera = makeShadowCamera();
    const projection = camera.projection;
    if (projection.kind !== 'orthographic') throw new Error('test shadow camera must be orthographic');
    wideCamera.projection = createOrthographicProjection({
      halfHeight: projection.halfHeight * 2,
      halfWidth: projection.halfWidth * 2,
    });
    const first = makeWgpuScene3DState();
    const second = makeWgpuScene3DState();

    drawWgpuScene3DShadowMap(first.state, makeShadowScene3D(), camera, light);
    drawWgpuScene3DShadowMap(second.state, makeShadowScene3D(), wideCamera, light);

    expect(getWgpuScene3DRuntime(second.state).shadow!.normalBiasWorld).toBeCloseTo(
      getWgpuScene3DRuntime(first.state).shadow!.normalBiasWorld * 2,
    );
  });

  it('rejects a perspective directional shadow camera', () => {
    const { state } = makeWgpuScene3DState();
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: { aspect: 1, fovY: Math.PI / 4, kind: 'perspective' },
    });

    expect(() => drawWgpuScene3DShadowMap(state, makeShadowScene3D(), camera, SHADOW_LIGHT)).toThrow(
      'requires an orthographic shadow camera',
    );
    expect(getWgpuScene3DRuntime(state).shadow).toBeNull();
  });

  it('handles false -> true -> false without allocating or sampling a stale shadow', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = makeShadowScene3D();
    const camera = makeShadowCamera();

    drawWgpuScene3DShadowMap(state, scene, camera, createDirectionalLight({ castsShadow: false }));
    expect(getWgpuScene3DRuntime(state).shadow).toBeNull();

    drawWgpuScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);
    const runtime = getWgpuScene3DRuntime(state);
    const shadow = runtime.shadow;
    const passCount = fake.calls.filter((call) => call.name === 'beginRenderPass').length;
    expect(shadow!.enabled).toBe(true);
    expect(passCount).toBeGreaterThan(0);

    drawWgpuScene3DShadowMap(state, scene, camera, createDirectionalLight({ castsShadow: false }));

    expect(runtime.shadow).toBe(shadow);
    expect(runtime.shadow!.enabled).toBe(false);
    expect(fake.calls.filter((call) => call.name === 'beginRenderPass')).toHaveLength(passCount);
  });

  // The sibling of the forward-pass defect: the shadow pass also bound an index buffer and issued
  // drawIndexed unconditionally, so a non-indexed caster rendered (once the forward path was fixed)
  // but cast no shadow. glShadowMap has always branched to drawArrays for this case.
  it('issues a non-indexed draw for a caster without indices', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = createNode3D(Node3DKind);
    addNodeChild(
      scene,
      createMesh(
        createMeshGeometry({
          indices: null,
          layout: {
            attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
            stride: 12,
          },
          vertices: new Float32Array(9),
        }),
        [],
      ),
    );

    drawWgpuScene3DShadowMap(state, scene, makeShadowCamera(), SHADOW_LIGHT);

    const draw = fake.calls.find((c) => c.name === 'draw');
    expect(draw).toBeDefined();
    expect(draw!.args[0]).toBe(3);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(false);
    expect(fake.calls.some((c) => c.name === 'setIndexBuffer')).toBe(false);
  });

  it('opens a depth-only pass and renders each caster mesh depth', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera(), SHADOW_LIGHT);

    expect(fake.calls.some((c) => c.name === 'beginRenderPass')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'setPipeline')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'drawIndexed')).toBe(true);
    expect(fake.calls.some((c) => c.name === 'end')).toBe(true);
    expect(getWgpuScene3DRuntime(state).shadowDepthSkinnedPipeline).toBeNull();
    expect(
      fake.calls.some(
        (call) => call.name === 'createTexture' && (call.args[0] as GPUTextureDescriptor).format === 'rgba32float',
      ),
    ).toBe(false);
  });

  it('draws a GPU-skinned caster through a palette-backed depth variant', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuGpuSkinning(state);
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(
      createMeshGeometry({
        indices: new Uint16Array([0, 0, 0]),
        layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
        vertices: new Float32Array(20),
      }),
      [],
    );
    mesh.skin = { skeleton: { jointMatrices: new Float32Array(16) } as Skeleton3D };
    addNodeChild(scene, mesh);

    drawWgpuScene3DShadowMap(state, scene, makeShadowCamera(), SHADOW_LIGHT);

    const shaderCalls = fake.calls.filter((call) => call.name === 'createShaderModule');
    const skinnedSource = shaderCalls
      .map((call) => String((call.args[0] as { code: string }).code))
      .find((code) => code.includes('jointTexture'));
    expect(skinnedSource).toContain('skinMatrix(joints0, weights0)');
    expect(getWgpuScene3DRuntime(state).shadowDepthSkinnedPipeline).not.toBeNull();
    expect(
      fake.calls.some(
        (call) => call.name === 'createTexture' && (call.args[0] as GPUTextureDescriptor).format === 'rgba32float',
      ),
    ).toBe(true);
    expect(fake.calls.some((call) => call.name === 'setBindGroup' && call.args[0] === 0)).toBe(true);
  });

  it('compiles a vertex-only depth module with the GL->WebGPU depth remap', () => {
    const { fake, state } = makeWgpuScene3DState();
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera(), SHADOW_LIGHT);

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
    drawWgpuScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);
    drawWgpuScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);
    const depthCreates = fake.calls.filter(
      (c) => c.name === 'createTexture' && (c.args[0] as GPUTextureDescriptor).format === 'depth32float',
    ).length;
    expect(depthCreates).toBe(1);
  });

  it('is a no-op when no command encoder is active', () => {
    const { fake, state } = makeWgpuScene3DState();
    getWgpuRenderStateRuntime(state).commandEncoder = null;
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera(), SHADOW_LIGHT);
    expect(fake.calls.some((c) => c.name === 'beginRenderPass')).toBe(false);
    expect(getWgpuScene3DRuntime(state).shadow).toBeNull();
  });

  it('binds a group(3) shadow group on the lit PBR draw that follows', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuStandardPbrMaterial(state);
    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera(), SHADOW_LIGHT);

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

  // An instanced caster draws once per instance at world * instanceMatrix. Recording a single rigid copy
  // at the node's world matrix loses every instance's shadow, and because the per-instance matrix routinely
  // carries the model's authoring scale it can stamp a wildly mis-sized silhouette over the map.
  it('instances an instanced caster rather than drawing one copy at the node world matrix', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = createNode3D(Node3DKind);
    const mesh = createInstancedMesh(createBoxMeshGeometry(), [], 8);
    setInstancedMeshInstanceCount(mesh, 3);
    setInstancedMeshInstanceMatrix(mesh, 0, shadowTranslation(0));
    setInstancedMeshInstanceMatrix(mesh, 1, shadowTranslation(0.5));
    setInstancedMeshInstanceMatrix(mesh, 2, shadowTranslation(-0.5));
    addNodeChild(scene, mesh);

    drawWgpuScene3DShadowMap(state, scene, makeShadowCamera(), SHADOW_LIGHT);

    const draws = fake.calls.filter((call) => call.name === 'drawIndexed');
    expect(draws).toHaveLength(1);
    expect(draws[0]!.args[1]).toBe(3);
    expect(fake.calls.some((call) => call.name === 'setVertexBuffer' && call.args[0] === 1)).toBe(true);
  });

  it('casts nothing for an instanced caster with no live instances', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createInstancedMesh(createBoxMeshGeometry(), [], 8));

    drawWgpuScene3DShadowMap(state, scene, makeShadowCamera(), SHADOW_LIGHT);

    expect(fake.calls.filter((call) => call.name === 'drawIndexed')).toHaveLength(0);
  });

  // Two instanced casters in one depth pass must not share an instance buffer: the pass is submitted once,
  // so a shared buffer would leave both reading whichever batch was written last.
  it('gives each instanced caster in a pass its own instance buffer', () => {
    const { fake, state } = makeWgpuScene3DState();
    const scene = createNode3D(Node3DKind);
    for (const x of [0, 0.5]) {
      const mesh = createInstancedMesh(createBoxMeshGeometry(), [], 8);
      setInstancedMeshInstanceCount(mesh, 1);
      setInstancedMeshInstanceMatrix(mesh, 0, shadowTranslation(x));
      addNodeChild(scene, mesh);
    }

    drawWgpuScene3DShadowMap(state, scene, makeShadowCamera(), SHADOW_LIGHT);

    const bound = fake.calls
      .filter((call) => call.name === 'setVertexBuffer' && call.args[0] === 1)
      .map((call) => call.args[1]);
    expect(bound).toHaveLength(2);
    expect(new Set(bound).size).toBe(2);
  });

  it('still draws an ordinary rigid caster with a single non-instanced draw', () => {
    const { fake, state } = makeWgpuScene3DState();

    drawWgpuScene3DShadowMap(state, makeShadowScene3D(), makeShadowCamera(), SHADOW_LIGHT);

    const draws = fake.calls.filter((call) => call.name === 'drawIndexed');
    expect(draws).toHaveLength(1);
    expect(draws[0]!.args[1]).toBe(1);
  });
});

describe('WGPU_DIRECTIONAL_SHADOW_WGSL', () => {
  it('uses a bounded runtime PCF radius and configurable receiver biases', () => {
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain(
      'sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f)',
    );
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain('geometricNormal * shadow.params.w');
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain('0.5 - shadow.params.z');
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain('if (radius == 0)');
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain('return compareDirectionalShadow(uv, depthRef)');
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain('if (radius == 1)');
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain('for (var x = -1; x <= 1; x = x + 1)');
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain(
      'for (var x = -MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x <= MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x = x + 1)',
    );
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).toContain('return sum / 9.0');
    expect(WGPU_DIRECTIONAL_SHADOW_WGSL).not.toContain('0.0025');
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
    expect(code).toContain('direct * sampleDirectionalShadow(in.worldPosition, geometricNormal)');
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
    expect(code).toContain('direct * sampleDirectionalShadow(in.worldPosition, geometricNormal)');
  });
});
