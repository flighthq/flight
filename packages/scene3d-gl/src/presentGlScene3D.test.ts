import { createCamera3D, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createVector3 } from '@flighthq/geometry/contract';
import { createAmbientLight, createDirectionalLight } from '@flighthq/lighting/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { Camera3D, GlRenderTarget, Scene3DLightsLike } from '@flighthq/types/contract';

import { makeGlScene3DState } from './glScene3DTestHelper';
import { presentGlScene3D } from './presentGlScene3D';
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

function makeTarget(): GlRenderTarget {
  const out = allocateEntity<Camera3D>();
  out.requestedAxes = {
    width: 256,
    height: 256,
    format: 'rgba16f',
    colorAttachments: 1,
    colorFormats: ['rgba16f'],
    sampleCount: 1,
    depth: 'depth-stencil',
    colorSpace: 'linear',
  };
  out.width = 256;
  out.height = 256;
  out.format = 'rgba16f';
  out.colorAttachments = 1;
  out.colorFormats = ['rgba16f'];
  out.depth = 'depth-stencil';
  out.colorSpace = 'linear';
  out.clearColors = [];
  out.clearDepth = 1;
  out.sampleCount = 1;
  out.framebuffer = { id: 'sceneFb' } as unknown as WebGLFramebuffer;
  out.resolveFramebuffer = null;
  out.textures = [{ id: 'sceneTex' } as unknown as WebGLTexture];
  out.texture = { id: 'sceneTex' } as unknown as WebGLTexture;
  out.depthTexture = null;
  out.colorRenderbuffers = [];
  out.depthStencilRenderbuffer = { id: 'sceneDepth' } as unknown as WebGLRenderbuffer;
  return finishEntity(out);
}

const LIGHTS: Scene3DLightsLike = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, -1), intensity: 1 }),
};

describe('presentGlScene3D', () => {
  it('renders into the target then presents to the canvas (default framebuffer)', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const target = makeTarget();

    presentGlScene3D(state, target, scene, makeCamera(), LIGHTS);

    const framebufferBinds = gl.calls.filter((c) => c.name === 'bindFramebuffer');
    // The scene is drawn into the target's framebuffer...
    expect(framebufferBinds.some((c) => c.args[1] === target.framebuffer)).toBe(true);
    // ...and the linear->sRGB present writes to the canvas (default framebuffer = null).
    expect(framebufferBinds.some((c) => c.args[1] === null)).toBe(true);
  });

  it('clears the background color and the depth buffer before drawing', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));

    presentGlScene3D(state, makeTarget(), scene, makeCamera(), LIGHTS);

    // beginGlRenderPass clears per-attachment (clearBufferfv for color location 0) and the depth/stencil
    // buffer (clearBufferfi), the WebGL2 path that lets each MRT attachment carry its own clear value.
    const colorClears = gl.calls.filter((c) => c.name === 'clearBufferfv' && c.args[0] === gl.COLOR);
    expect(colorClears.some((c) => c.args[1] === 0)).toBe(true);
    const depthClears = gl.calls.filter((c) => c.name === 'clearBufferfi' && c.args[0] === gl.DEPTH_STENCIL);
    expect(depthClears.length).toBeGreaterThan(0);
  });

  it('presents to the canvas after the scene draw, so the encode reads the rendered target', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    const target = makeTarget();

    presentGlScene3D(state, target, scene, makeCamera(), LIGHTS);

    const names = gl.calls.map((c) => c.name);
    const lastTargetBind = names.lastIndexOf('bindTexture');
    const lastDraw = names.lastIndexOf('drawElements');
    // The present pass binds the scene texture and draws the fullscreen quad as the final operations.
    expect(lastTargetBind).toBeGreaterThan(0);
    expect(lastDraw).toBeGreaterThan(0);
    expect(gl.calls.some((c) => c.name === 'bindTexture' && c.args[1] === target.texture)).toBe(true);
  });

  it('ends the target pass when scene drawing throws', () => {
    const { state, gl } = makeGlScene3DState();
    registerGlStandardPbrMaterial(state);
    const scene = createNode3D(Node3DKind);
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createStandardPbrMaterial()]));
    Object.assign(gl, {
      drawElements(): void {
        throw new Error('custom draw failed');
      },
    });

    expect(() => presentGlScene3D(state, makeTarget(), scene, makeCamera(), LIGHTS)).toThrow('custom draw failed');
    expect(getGlRenderStateRuntime(state).currentRenderTarget).toBeNull();
  });
});
