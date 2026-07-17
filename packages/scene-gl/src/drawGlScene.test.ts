import { createCamera, setCameraViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3, setMatrix4Identity } from '@flighthq/geometry';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createParticleEmitter3D, reserveParticleEmitter3D } from '@flighthq/particleemitter';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import { createMesh, createScene } from '@flighthq/scene';
import type { Camera, GlRenderTarget, SceneLights } from '@flighthq/types';

import { drawGlScene } from './drawGlScene';
import { makeGlSceneState } from './glSceneTestHelper';
import { registerStandardPbrGlMaterial } from './registerStandardPbrGlMaterial';

function makeCamera(): Camera {
  const camera = createCamera({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCameraViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

const LIGHTS: SceneLights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('drawGlScene', () => {
  it('binds once for a run of subsets sharing a material', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    const material = createStandardPbrMaterial();
    const meshA = createMesh(createBoxMeshGeometry(), [material]);
    const meshB = createMesh(createBoxMeshGeometry(), [material]);
    addNodeChild(scene, meshA);
    addNodeChild(scene, meshB);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    // Same material across both meshes: bound once, drawn twice.
    expect(gl.calls.filter((c) => c.name === 'useProgram').length).toBe(1);
    expect(gl.calls.filter((c) => c.name === 'drawElements').length).toBe(2);
  });

  it('invalidates render-gl binding cache after drawing so the present pass re-binds', () => {
    const { state } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    // Stand in for render-gl having a program bound and cached before the scene draws. The mesh
    // renderers bind their own programs with raw gl.useProgram, which render-gl's cache never sees;
    // without the post-draw invalidation the stale program would survive and the effect-pipeline
    // present pass would set uniforms against a program that is no longer bound (INVALID_OPERATION).
    const runtime = getGlRenderStateRuntime(state);
    runtime.currentProgram = {} as WebGLProgram;

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    expect(runtime.currentProgram).toBeNull();
  });

  it("declares the bound render target 'linear' (scene materials output linear HDR)", () => {
    const { state } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    const runtime = getGlRenderStateRuntime(state);
    const target = { colorSpace: 'srgb' } as GlRenderTarget;
    runtime.currentRenderTarget = target;

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    expect(target.colorSpace).toBe('linear');
  });

  it('does not draw a disabled mesh', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.enabled = false;
    addNodeChild(scene, mesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });

  it('draws each visible mesh subset with its registered material renderer', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'useProgram')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('enables GL blend for subsets with alphaMode blend and disables it after', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const mesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    addNodeChild(scene, mesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    const enableCalls = gl.calls.filter((c) => c.name === 'enable');
    const disableCalls = gl.calls.filter((c) => c.name === 'disable');
    // BLEND = 0x0be2
    expect(enableCalls.some((c) => c.args[0] === 0x0be2)).toBe(true);
    expect(disableCalls.some((c) => c.args[0] === 0x0be2)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'blendFunc')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('draws opaque subsets before blended subsets regardless of scene order', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    // Add blended first, then opaque — opaque should still draw before blended.
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';
    const opaqueMaterial = createStandardPbrMaterial();

    const blendedMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    const opaqueMesh = createMesh(createBoxMeshGeometry(), [opaqueMaterial]);
    addNodeChild(scene, blendedMesh);
    addNodeChild(scene, opaqueMesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    // Both meshes drawn.
    expect(gl.calls.filter((c) => c.name === 'drawElements').length).toBe(2);
    // GL blending was enabled and then disabled (blended pass ran).
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(true);
  });

  it('does not enable GL blend when all subsets are opaque', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    // No blended subsets: GL_BLEND should not be enabled.
    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(false);
  });

  it('routes a mesh with node alpha below 1 through the blended pass even with an opaque material', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    // Opaque material, but the node is faded (alpha < 1). prepareSceneRender (run inside drawGlScene)
    // folds the authored alpha into worldAlpha, and drawGlScene must route the fading object through
    // the blended pass so it composites correctly.
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.alpha = 0.5;
    addNodeChild(scene, mesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(true);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
    // The resolved node opacity was uploaded to u_objectAlpha (a uniform1f of 0.5).
    expect(gl.calls.some((c) => c.name === 'uniform1f' && c.args[1] === 0.5)).toBe(true);
  });

  it('keeps a fully-opaque mesh (node alpha 1) in the opaque pass', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    mesh.alpha = 1;
    addNodeChild(scene, mesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'enable' && c.args[0] === 0x0be2)).toBe(false);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(true);
  });

  it('skips a subset whose material has no registered renderer (no fallback)', () => {
    const { state, gl } = makeGlSceneState();
    // No registerStandardPbrGlMaterial: nothing resolves.
    const scene = createScene();
    const mesh = createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]);
    addNodeChild(scene, mesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);
    expect(gl.calls.some((c) => c.name === 'drawElements')).toBe(false);
  });

  it('sorts blended subsets back-to-front by camera depth', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    const blendedMaterial = createStandardPbrMaterial();
    blendedMaterial.alphaMode = 'blend';

    // Place two meshes at different Z depths: far (z=-3) and near (z=-1). The far mesh should be
    // drawn first (larger clip-W, farthest from camera) in the blended pass. Set localMatrix
    // directly — the 3D transform is a raw Matrix4 (column 3 carries the world translation).
    const farMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    const nearMesh = createMesh(createBoxMeshGeometry(), [blendedMaterial]);
    setMatrix4Identity(farMesh.localMatrix);
    farMesh.localMatrix.m[14] = -3;
    setMatrix4Identity(nearMesh.localMatrix);
    nearMesh.localMatrix.m[14] = -1;
    addNodeChild(scene, nearMesh);
    addNodeChild(scene, farMesh);

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    // Both blended meshes are drawn.
    expect(gl.calls.filter((c) => c.name === 'drawElements').length).toBe(2);
  });

  it('draws a ParticleEmitter3D node in the scene via the single drawGlScene call', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    // An emitter carries no geometry, so it never appears in the visible-mesh list; drawGlScene must
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

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'drawElementsInstanced')).toBe(true);
  });

  it('does not draw an instanced particle pass when the scene has no emitters', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);

    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    drawGlScene(state, scene, makeCamera(), LIGHTS);

    expect(gl.calls.some((c) => c.name === 'drawElementsInstanced')).toBe(false);
  });
});
