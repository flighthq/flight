import {
  createCamera3D,
  createOrthographicProjection,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/camera/contract';
import { createVector3 } from '@flighthq/geometry/contract';
import { createDirectionalLight } from '@flighthq/lighting/contract';
import { createMeshGeometry, updateMeshMorph } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { Skin, VertexAttributeLayout } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { drawGlScene3DShadowMap } from './glShadowMap';

const POSITION_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

const SHADOW_LIGHT = createDirectionalLight({ castsShadow: true });

// A layout carrying joints0 (what hasMeshGeometrySkin keys off) so a mesh with a skin GPU-skins.
const SKINNED_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x4', semantic: 'joints0' },
    { byteOffset: 28, format: 'float32x4', semantic: 'weights0' },
  ],
  stride: 44,
};

function lastUploadedVertices(calls: readonly { name: string; args: readonly unknown[] }[]): Float32Array {
  const data = calls
    .filter((c) => c.name === 'bufferData')
    .map((c) => c.args[1])
    .filter((d): d is Float32Array => d instanceof Float32Array);
  return data[data.length - 1]!;
}

function makeShadowState() {
  const { state, gl } = makeGlScene3DState();

  const calls = gl.calls;
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]): unknown => {
      calls.push({ name, args });
      return result;
    };

  Object.assign(gl as unknown as Record<string, unknown>, {
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_BINDING: 0x8ca6,
    VIEWPORT: 0x0ba2,
    DEPTH_BUFFER_BIT: 0x100,
    COLOR_BUFFER_BIT: 0x4000,
    FRONT: 0x0404,
    MAX_SAMPLES: 0x8d57,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812f,
    COLOR_ATTACHMENT0: 0x8ce0,
    DEPTH_STENCIL_ATTACHMENT: 0x821a,
    DEPTH24_STENCIL8: 0x88f0,
    DEPTH_STENCIL: 0x84f9,
    UNSIGNED_INT_24_8: 0x84fa,
    RENDERBUFFER: 0x8d41,
    createFramebuffer: () => ({}),
    deleteFramebuffer: () => {},
    bindFramebuffer: record('bindFramebuffer'),
    viewport: record('viewport'),
    getParameter: (param: number) => {
      const gl2 = gl as unknown as Record<string, number>;
      if (param === gl2['MAX_SAMPLES']) return 4;
      if (param === gl2['FRAMEBUFFER_BINDING']) return null;
      if (param === gl2['VIEWPORT']) return new Int32Array([0, 0, 256, 256]);
      return null;
    },
    clear: record('clear'),
    createRenderbuffer: () => ({}),
    bindRenderbuffer: () => {},
    deleteRenderbuffer: () => {},
    framebufferTexture2D: () => {},
    framebufferRenderbuffer: () => {},
    getExtension: () => ({}),
  });

  (state[EntityRuntimeKey] as unknown as Record<string, unknown>).currentFramebuffer = null;

  return { state, gl };
}

function makeShadowCamera() {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: createOrthographicProjection({ halfHeight: 10, halfWidth: 10 }),
  });
  setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 10, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

describe('drawGlScene3DShadowMap', () => {
  it('does not allocate or render when the directional light has shadows disabled', () => {
    const { state, gl } = makeShadowState();

    drawGlScene3DShadowMap(
      state,
      createNode3D(Node3DKind),
      makeShadowCamera(),
      createDirectionalLight({ castsShadow: false }),
    );

    const runtime = getGlScene3DRuntime(state);
    expect(runtime.shadowTarget).toBeNull();
    expect(runtime.shadow).toBeNull();
    expect(gl.calls.some((call) => call.name === 'clear')).toBe(false);
  });

  it('lazily creates the shadow target on the first call', () => {
    const { state } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const camera = makeShadowCamera();

    drawGlScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);

    expect(getGlScene3DRuntime(state).shadowTarget).not.toBeNull();
  });

  it('reuses the same shadow target on subsequent calls', () => {
    const { state } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const camera = makeShadowCamera();

    drawGlScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);
    const firstTarget = getGlScene3DRuntime(state).shadowTarget;

    drawGlScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);
    const secondTarget = getGlScene3DRuntime(state).shadowTarget;

    expect(secondTarget).toBe(firstTarget);
  });

  it('records the light-space matrix on the runtime', () => {
    const { state } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const camera = makeShadowCamera();

    drawGlScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);

    const shadow = getGlScene3DRuntime(state).shadow;
    expect(shadow).not.toBeNull();
    expect(shadow!.matrix).not.toBeNull();
  });

  it('records normalized PCF and receiver-bias configuration on the runtime', () => {
    const { state } = makeShadowState();
    const light = createDirectionalLight({
      castsShadow: true,
      normalBias: 0.02,
      pcfRadius: 8.7,
      shadowBias: 0.01,
    });

    drawGlScene3DShadowMap(state, createNode3D(Node3DKind), makeShadowCamera(), light);

    expect(getGlScene3DRuntime(state).shadow).toEqual(
      expect.objectContaining({ enabled: true, normalBias: 0.02, pcfRadius: 2, shadowBias: 0.01 }),
    );
  });

  it('handles false -> true -> false without allocating or sampling a stale shadow', () => {
    const { state, gl } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const camera = makeShadowCamera();

    drawGlScene3DShadowMap(state, scene, camera, createDirectionalLight({ castsShadow: false }));
    expect(getGlScene3DRuntime(state).shadow).toBeNull();
    expect(getGlScene3DRuntime(state).shadowTarget).toBeNull();

    drawGlScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);
    const runtime = getGlScene3DRuntime(state);
    const shadow = runtime.shadow;
    const target = runtime.shadowTarget;
    const clearCount = gl.calls.filter((call) => call.name === 'clear').length;
    expect(shadow!.enabled).toBe(true);
    expect(clearCount).toBeGreaterThan(0);

    drawGlScene3DShadowMap(state, scene, camera, createDirectionalLight({ castsShadow: false }));

    expect(runtime.shadow).toBe(shadow);
    expect(runtime.shadow!.enabled).toBe(false);
    expect(runtime.shadowTarget).toBe(target);
    expect(gl.calls.filter((call) => call.name === 'clear')).toHaveLength(clearCount);
  });

  it('sets up the depth pass with front-face culling', () => {
    const { state, gl } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const camera = makeShadowCamera();

    drawGlScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);

    const frontValue = (gl as unknown as Record<string, number>)['FRONT'];
    const cullFaceCall = gl.calls.find((c) => c.name === 'cullFace' && c.args[0] === frontValue);
    expect(cullFaceCall).toBeDefined();

    const cullFaceConstant = (gl as unknown as Record<string, number>)['CULL_FACE'];
    const enableCullFaceCall = gl.calls.find((c) => c.name === 'enable' && c.args[0] === cullFaceConstant);
    expect(enableCullFaceCall).toBeDefined();
  });

  it('records the caster at the pose the app blended before the pass', () => {
    const { state, gl } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const geometry = createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array([0, 0, 0, 1, 0, 0]) });
    const mesh = createMesh(geometry, []);
    // Weight 1 on a target that raises y by 5. The morph is blended by the app's prepareScene3DMorph
    // before any draw (here updateMeshMorph stands in for it); the depth pass just uploads that pose,
    // it no longer re-blends internally — otherwise the cull would have already lagged a frame.
    mesh.morph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([0, 5, 0, 0, 5, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    addNodeChild(scene, mesh);
    updateMeshMorph(mesh);

    drawGlScene3DShadowMap(state, scene, makeShadowCamera(), SHADOW_LIGHT);

    const uploaded = lastUploadedVertices(gl.calls);
    expect(uploaded[1]).toBe(5);
    expect(uploaded[4]).toBe(5);
  });

  it('draws a GPU-skinned caster through the HAS_SKIN depth variant', () => {
    const { state } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const geometry = createMeshGeometry({
      layout: SKINNED_LAYOUT,
      vertices: new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
    });
    const mesh = createMesh(geometry, []);
    const skin: Skin = {
      skeleton: {
        [EntityRuntimeKey]: undefined,
        inverseBindMatrices: new Float32Array(16),
        jointMatrices: new Float32Array(16),
        joints: [],
        names: null,
      },
    };
    mesh.skin = skin;
    addNodeChild(scene, mesh);

    drawGlScene3DShadowMap(state, scene, makeShadowCamera(), SHADOW_LIGHT);

    // A skinned caster compiles + uses the dedicated HAS_SKIN depth program rather than the rigid one.
    expect([...getGlScene3DRuntime(state).programCache.keys()]).toContain('shadow:depth:skin');
  });

  it('restores the previous framebuffer after the depth pass', () => {
    const { state, gl } = makeShadowState();
    const scene = createNode3D(Node3DKind);
    const camera = makeShadowCamera();

    drawGlScene3DShadowMap(state, scene, camera, SHADOW_LIGHT);

    const framebufferConstant = (gl as unknown as Record<string, number>)['FRAMEBUFFER'];
    const bindFramebufferCalls = gl.calls.filter((c) => c.name === 'bindFramebuffer');
    const lastBindFramebuffer = bindFramebufferCalls[bindFramebufferCalls.length - 1];

    expect(lastBindFramebuffer).toBeDefined();
    expect(lastBindFramebuffer.args[0]).toBe(framebufferConstant);
    expect(lastBindFramebuffer.args[1]).toBeNull();
  });
});
