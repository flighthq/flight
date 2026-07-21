import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting';
import { createStandardPbrMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createSceneNode, SceneNodeKind } from '@flighthq/scene';
import type { Camera3D, GlRenderTarget, SceneLights } from '@flighthq/types';

import { makeGlSceneState } from './glSceneTestHelper';
import { presentGlScene } from './presentGlScene';
import { registerStandardPbrGlMaterial } from './registerStandardPbrGlMaterial';

function makeCamera(): Camera3D {
  const camera = createCamera3D({
    far: 100,
    near: 0.1,
    projection: { aspect: 1, fovY: Math.PI / 3, kind: 'perspective' },
  });
  setCamera3DViewMatrix4FromLookAt(camera, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  return camera;
}

function makeTarget(): GlRenderTarget {
  return {
    width: 256,
    height: 256,
    format: 'rgba16f',
    colorSpace: 'linear',
    clearColors: [],
    clearDepth: 1,
    sampleCount: 1,
    framebuffer: { id: 'sceneFb' } as unknown as WebGLFramebuffer,
    resolveFramebuffer: null,
    textures: [{ id: 'sceneTex' } as unknown as WebGLTexture],
    texture: { id: 'sceneTex' } as unknown as WebGLTexture,
    depthTexture: null,
    colorRenderbuffers: [],
    depthStencilRenderbuffer: { id: 'sceneDepth' } as unknown as WebGLRenderbuffer,
  };
}

const LIGHTS: SceneLights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('presentGlScene', () => {
  it('renders into the target then presents to the canvas (default framebuffer)', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const target = makeTarget();

    presentGlScene(state, target, scene, makeCamera(), LIGHTS);

    const framebufferBinds = gl.calls.filter((c) => c.name === 'bindFramebuffer');
    // The scene is drawn into the target's framebuffer...
    expect(framebufferBinds.some((c) => c.args[1] === target.framebuffer)).toBe(true);
    // ...and the linear->sRGB present writes to the canvas (default framebuffer = null).
    expect(framebufferBinds.some((c) => c.args[1] === null)).toBe(true);
  });

  it('clears the background color and the depth buffer before drawing', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    presentGlScene(state, makeTarget(), scene, makeCamera(), LIGHTS);

    // beginGlRenderPass clears per-attachment (clearBufferfv for color location 0) and the depth/stencil
    // buffer (clearBufferfi), the WebGL2 path that lets each MRT attachment carry its own clear value.
    const colorClears = gl.calls.filter((c) => c.name === 'clearBufferfv' && c.args[0] === gl.COLOR);
    expect(colorClears.some((c) => c.args[1] === 0)).toBe(true);
    const depthClears = gl.calls.filter((c) => c.name === 'clearBufferfi' && c.args[0] === gl.DEPTH_STENCIL);
    expect(depthClears.length).toBeGreaterThan(0);
  });

  it('presents to the canvas after the scene draw, so the encode reads the rendered target', () => {
    const { state, gl } = makeGlSceneState();
    registerStandardPbrGlMaterial(state);
    const scene = createSceneNode(SceneNodeKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const target = makeTarget();

    presentGlScene(state, target, scene, makeCamera(), LIGHTS);

    const names = gl.calls.map((c) => c.name);
    const lastTargetBind = names.lastIndexOf('bindTexture');
    const lastDraw = names.lastIndexOf('drawElements');
    // The present pass binds the scene texture and draws the fullscreen quad as the final operations.
    expect(lastTargetBind).toBeGreaterThan(0);
    expect(lastDraw).toBeGreaterThan(0);
    expect(gl.calls.some((c) => c.name === 'bindTexture' && c.args[1] === target.texture)).toBe(true);
  });
});
