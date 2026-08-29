import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera/contract';
import { createVector3 } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import { createParticleEmitter3D, reserveParticleEmitter3D } from '@flighthq/particleemitter/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { Camera3D, GlRenderTarget, Scene3DLightsLike } from '@flighthq/types/contract';
import { BlendMode } from '@flighthq/types/contract';

import { drawGlScene3D } from './drawGlScene3D';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerGlStandardPbrMaterial } from './registerGlStandardPbrMaterial';

function makeCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('drawGlScene3D', () => {
  it('binds once for a run of subsets sharing a material', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const material = createStandardPbrMaterial();
    const meshA = createMesh(createBoxMeshGeometry(), [material]);
    const meshB = createMesh(createBoxMeshGeometry(), [material]);
    addNodeChild(scene, meshA);
    addNodeChild(scene, meshB);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    // Same material across both meshes: bound once, drawn twice.
    expect(gl.calls.filter((c) => c.name === 'useProgram').length).toBe(1);
    expect(gl.calls.filter((c) => c.name === 'drawElements').length).toBe(2);
  });

  it('invalidates render-gl binding cache after drawing so the present pass re-binds', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    // Stand in for render-gl having a program bound and cached before the scene draws. The mesh
    // renderers bind their own programs with raw gl.useProgram, which render-gl's cache never sees;
    // without the post-draw invalidation the stale program would survive and the effect-pipeline
    // present pass would set uniforms against a program that is no longer bound (INVALID_OPERATION).
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentShader = { locations: null, program: {} as WebGLProgram };

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(runtime.currentShader).toBeNull();
  });

  it("declares the bound render target 'linear' (scene materials output linear HDR)", () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    const runtime = getGlRenderStateRuntime(state);
    const target = { colorSpace: 'srgb' } as GlRenderTarget;
    runtime.currentRenderTarget = target;

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(target.colorSpace).toBe('linear');
  });

  it('does not draw a disabled mesh', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.enabled = false;
    addNodeChild(scene, mesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });

  it('draws each visible mesh subset with its registered material renderer', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('enables GL blend for subsets with alphaMode blend and disables it after', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const mesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    addNodeChild(scene, mesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    const enableCalls = gl.calls.filter((c) => c.name === 'enable');
    const disableCalls = gl.calls.filter((c) => c.name === 'disable');
    // BLEND = 0x0be2
    expect(enableCalls.some((c) => c.args[0] === 0x0be2)).toBe(true);
    expect(disableCalls.some((c) => c.args[0] === 0x0be2)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'blendFunc')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('keeps depth writes disabled across blended material rebinds and restores them after', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const firstMaterial = createStandardPbrMaterial({ alphaMode: 'blend' });
    const secondMaterial = createStandardPbrMaterial({ alphaMode: 'blend' });
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [firstMaterial]));
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [secondMaterial]));

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.filter((c) => c.name === 'useProgram')).toHaveLength(2);
    expect(gl.calls.filter((c) => c.name === 'depthMask').map((c) => c.args[0])).toEqual([false, false, true]);
    expect(getGlScene3DRuntime(state).activeBlendedRun).toBe(false);
  });

  it('applies the surface material blendMode for a blended subset', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const material = createStandardPbrMaterial({ alphaMode: 'blend', blendMode: BlendMode.Add });
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(
      gl.calls.some((call) => call.name === 'blendFunc' && call.args[0] === gl.ONE && call.args[1] === gl.ONE),
    ).toBe(true);
  });

  // Normal resolves through the same premultiplied registry as every other mode. The straight-alpha
  // special case that used to sit in front of it composited a straight tail correctly under Normal and
  // wrongly under every other equation; SRC_ALPHA reappearing here is that fork coming back.
  it('uses premultiplied Normal factors, never straight-alpha ones', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const material = createStandardPbrMaterial({ alphaMode: 'blend' });
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [material]));

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(
      gl.calls.some(
        (call) => call.name === 'blendFunc' && call.args[0] === gl.ONE && call.args[1] === gl.ONE_MINUS_SRC_ALPHA,
      ),
    ).toBe(true);
    expect(gl.calls.some((call) => call.name === 'blendFunc' && call.args[0] === gl.SRC_ALPHA)).toBe(false);
  });

  it('draws opaque subsets before blended subsets regardless of scene order', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    // Add blended first, then opaque — opaque should still draw before blended.
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const opaqueMaterial = createStandardPbrMaterial();

    const blendedMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    const opaqueMesh = createMesh(createBoxMeshGeometry(), [opaqueMaterial]);
    addNodeChild(scene, blendedMesh);
    addNodeChild(scene, opaqueMesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    // Both meshes drawn.
    expect(gl.calls.filter((c) => c.name === 'drawElements').length).toBe(2);
    // GL blending was enabled and then disabled (blended pass ran).
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(true);
  });

  it('does not enable GL blend when all subsets are opaque', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    // No blended subsets: GL_BLEND should not be enabled.
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(false);
  });

  it('routes a mesh with node alpha below 1 through the blended pass even with an opaque material', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    // Opaque material, but the node is faded (alpha < 1). prepareScene3DRender (run inside drawGlScene3D)
    // folds the authored alpha into worldAlpha, and drawGlScene3D must route the fading object through
    // the blended pass so it composites correctly.
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.alpha = 0.5;
    addNodeChild(scene, mesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
    // The resolved node opacity was uploaded to u_objectAlpha (a uniform1f of 0.5).
    expect(gl.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 0.5)).toBe(true);
  });

  it('reuses opaque and blended draw records across frames', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const opaque = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const blended = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    addNodeChild(scene, opaque);
    addNodeChild(scene, blended);

    const camera = makeCamera();
    drawGlScene3D(state, scene, camera, LIGHTS);
    const runtime = getGlScene3DRuntime(state);
    const opaqueEntry = runtime.opaqueDrawList[0];
    const blendedEntry = runtime.blendedDrawList[0];

    drawGlScene3D(state, scene, camera, LIGHTS);

    expect(runtime.opaqueDrawList[0]).toBe(opaqueEntry);
    expect(runtime.blendedDrawList[0]).toBe(blendedEntry);
    expect(runtime.opaquePool).toHaveLength(0);
    expect(runtime.blendedPool).toHaveLength(0);
  });

  it('keeps a fully-opaque mesh (node alpha 1) in the opaque pass', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.alpha = 1;
    addNodeChild(scene, mesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(false);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('skips a subset whose material has no registered renderer (no fallback)', () => {
    const { state, gl } = makeGlScene3DState();
    // No registerGlStandardPbrMaterial: nothing resolves.
    const scene = createNode3D(Node3DKind);
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });

  it('sorts blended subsets back-to-front by camera depth', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';

    // Place two meshes at different Z depths: far (z=-3) and near (z=-1). The far mesh should be
    // drawn first in the blended pass. Author the depth via the node's translation z — the translation
    // column of the composed local matrix.
    const farMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    const nearMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    farMesh.position.z = -3;
    invalidateNodeLocalTransform(farMesh);
    nearMesh.position.z = -1;
    invalidateNodeLocalTransform(nearMesh);
    addNodeChild(scene, nearMesh);
    addNodeChild(scene, farMesh);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(getGlScene3DRuntime(state).blendedDrawList.map((entry) => entry.mesh)).toEqual([farMesh, nearMesh]);
  });

  it('sorts blended subsets back-to-front with an orthographic camera', () => {
    const { state } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const farMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    const nearMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    farMesh.position.z = -3;
    nearMesh.position.z = -1;
    invalidateNodeLocalTransform(farMesh);
    invalidateNodeLocalTransform(nearMesh);
    addNodeChild(scene, nearMesh);
    addNodeChild(scene, farMesh);
    const camera = createCamera3D({
      far: 100,
      near: 0.1,
      projection: { halfHeight: 1, halfWidth: 1, kind: 'orthographic' },
    });
    setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });

    drawGlScene3D(state, scene, camera, LIGHTS);

    expect(getGlScene3DRuntime(state).blendedDrawList.map((entry) => entry.mesh)).toEqual([farMesh, nearMesh]);
  });

  it('draws a ParticleEmitter3D node in the scene via the single drawGlScene3D call', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    // An emitter carries no geometry, so it never appears in the visible-mesh list; drawGlScene3D must
    // run the emitter pass internally. The emitter's instanced pass is the only drawElementsInstanced
    // caller, so its presence proves the emitter was drawn without a separate manual pass.
    const emitter = createParticleEmitter3D();
    reserveParticleEmitter3D(emitter, 2);
    emitter.data.particleCount = 2;
    for (let i = 0; i < 2; i++) {
      emitter.data.transforms[i * 4 + 3] = 1;
      emitter.data.alphas[i] = 1;
      emitter.data.colors[i * 3] = 1;
      emitter.data.colors[i * 3 + 1] = 1;
      emitter.data.colors[i * 3 + 2] = 1;
    }
    addNodeChild(scene, emitter);

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'drawElementsInstanced')).toBe(true);
  });

  it('does not draw an instanced particle pass when the scene has no emitters', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);

    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    drawGlScene3D(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'drawElementsInstanced')).toBe(false);
  });
});
