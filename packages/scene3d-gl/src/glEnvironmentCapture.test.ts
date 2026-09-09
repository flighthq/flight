import { createMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createGlCubeRenderTarget, destroyGlCubeRenderTarget } from '@flighthq/render-gl/contract';
import { createMesh, createNode3D, Node3DKind } from '@flighthq/scene3d/contract';
import type { GlMeshMaterialRenderer, Scene3DLightsLike } from '@flighthq/types/contract';

import { getGlEnvironmentCaptureTexture, renderGlEnvironmentCapture } from './glEnvironmentCapture';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';

const CaptureMaterialKind = 'test:EnvironmentCapture';
const NO_LIGHTS: Scene3DLightsLike = { ambient: null, directional: null };

interface CameraSnapshot {
  aspect: number;
  far: number;
  fovY: number;
  near: number;
  view: Float32Array;
}

function makeCaptureState() {
  const gl = makeFakeGl2();
  const calls = gl.calls;
  const originalGetParameter = gl.getParameter.bind(gl);
  const previousFramebuffer = { name: 'previous-framebuffer' } as WebGLFramebuffer;
  const activeTexture = 0x84c0 + 5;
  Object.assign(gl, {
    ACTIVE_TEXTURE: 0x84e0,
    COLOR: 0x1800,
    COLOR_ATTACHMENT0: 0x8ce0,
    DEPTH24_STENCIL8: 0x88f0,
    DEPTH_STENCIL: 0x84f9,
    DEPTH_STENCIL_ATTACHMENT: 0x821a,
    DEPTH_WRITEMASK: 0x0b72,
    FRAMEBUFFER_BINDING: 0x8ca6,
    HALF_FLOAT: 0x140b,
    RENDERBUFFER: 0x8d41,
    RENDERBUFFER_BINDING: 0x8ca7,
    RGBA16F: 0x881a,
    SCISSOR_BOX: 0x0c10,
    SCISSOR_TEST: 0x0c11,
    STENCIL_TEST: 0x0b90,
    TEXTURE_BINDING_CUBE_MAP: 0x8514,
    TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515,
    TEXTURE_WRAP_R: 0x8072,
    VIEWPORT: 0x0ba2,
    bindRenderbuffer: (...args: unknown[]) => calls.push({ args, name: 'bindRenderbuffer' }),
    createRenderbuffer: () => {
      const result = { name: 'depth' } as WebGLRenderbuffer;
      calls.push({ args: [], name: 'createRenderbuffer' });
      return result;
    },
    framebufferRenderbuffer: (...args: unknown[]) => calls.push({ args, name: 'framebufferRenderbuffer' }),
    getParameter: (parameter: number) => {
      if (parameter === 0x84e0) return activeTexture;
      if (parameter === 0x8ca6) return previousFramebuffer;
      if (parameter === 0x0ba2) return new Int32Array([7, 8, 90, 70]);
      if (parameter === 0x0c10) return new Int32Array([9, 10, 50, 40]);
      if (parameter === 0x0b72) return true;
      if (parameter === 0x8ca7 || parameter === 0x8514) return null;
      return originalGetParameter(parameter);
    },
    renderbufferStorage: (...args: unknown[]) => calls.push({ args, name: 'renderbufferStorage' }),
    scissor: (...args: unknown[]) => calls.push({ args, name: 'scissor' }),
  });
  const { state } = makeGlScene3DState(gl);
  return { activeTexture, gl, previousFramebuffer, state };
}

function addCaptureMesh(
  state: ReturnType<typeof makeCaptureState>['state'],
  cameras: CameraSnapshot[],
  throwOnBind = false,
) {
  const renderer: GlMeshMaterialRenderer = {
    bind(_state, _material, _lights, camera): void {
      if (camera.projection.kind !== 'perspective') throw new Error('capture camera must be perspective');
      cameras.push({
        aspect: camera.projection.aspect,
        far: camera.far,
        fovY: camera.projection.fovY,
        near: camera.near,
        view: new Float32Array(camera.view.m),
      });
      if (throwOnBind) throw new Error('capture draw failed');
    },
    draw(): void {},
  };
  registerGlMeshMaterialRenderer(state, CaptureMaterialKind, renderer);
  const scene = createNode3D(Node3DKind);
  // Enclose the capture position so the real frustum cull keeps this observer mesh for every face.
  const mesh = createMesh(createBoxMeshGeometry(100, 100, 100), [createMaterial(CaptureMaterialKind)]);
  addNodeChild(scene, mesh);
  return { mesh, scene };
}

describe('getGlEnvironmentCaptureTexture', () => {
  it('returns the cubemap texture owned by the target', () => {
    const { state } = makeCaptureState();
    const target = createGlCubeRenderTarget(state, 16);
    expect(getGlEnvironmentCaptureTexture(target)).toBe(target.texture);
    destroyGlCubeRenderTarget(state, target);
  });
});

describe('renderGlEnvironmentCapture', () => {
  it('renders all six canonical face cameras with the requested clip distances', () => {
    const { state, gl, activeTexture, previousFramebuffer } = makeCaptureState();
    const cameras: CameraSnapshot[] = [];
    const { scene } = addCaptureMesh(state, cameras);
    const target = createGlCubeRenderTarget(state, 32);

    renderGlEnvironmentCapture(state, { x: 2, y: 3, z: 4 }, scene, NO_LIGHTS, target, {
      far: 250,
      near: 0.25,
    });

    expect(cameras).toHaveLength(6);
    expect(cameras.every((camera) => camera.near === 0.25 && camera.far === 250)).toBe(true);
    expect(cameras.every((camera) => camera.aspect === 1 && camera.fovY === Math.PI * 0.5)).toBe(true);
    expect(new Set(cameras.map((camera) => Array.from(camera.view).join(','))).size).toBe(6);
    const attachments = gl.calls.filter((call) => call.name === 'framebufferTexture2D').slice(-6);
    expect(attachments.map((call) => call.args[2])).toEqual(
      Array.from({ length: 6 }, (_, face) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + face),
    );
    expect(gl.calls.filter((call) => call.name === 'bindFramebuffer').at(-1)?.args).toEqual([
      gl.FRAMEBUFFER,
      previousFramebuffer,
    ]);
    expect(gl.calls.filter((call) => call.name === 'viewport').at(-1)?.args).toEqual([7, 8, 90, 70]);
    expect(gl.calls.filter((call) => call.name === 'activeTexture').at(-1)?.args).toEqual([activeTexture]);
    destroyGlCubeRenderTarget(state, target);
  });

  it('temporarily excludes one node and restores its enabled state', () => {
    const { state } = makeCaptureState();
    const cameras: CameraSnapshot[] = [];
    const { mesh, scene } = addCaptureMesh(state, cameras);
    const target = createGlCubeRenderTarget(state, 16);

    renderGlEnvironmentCapture(state, { x: 0, y: 0, z: 0 }, scene, NO_LIGHTS, target, { excludeNode: mesh });

    expect(cameras).toHaveLength(0);
    expect(mesh.enabled).toBe(true);
    destroyGlCubeRenderTarget(state, target);
  });

  it('restores exclusion and GL state when a face draw throws', () => {
    const { state, gl, activeTexture, previousFramebuffer } = makeCaptureState();
    const cameras: CameraSnapshot[] = [];
    const { scene } = addCaptureMesh(state, cameras, true);
    const excluded = createNode3D(Node3DKind);
    const target = createGlCubeRenderTarget(state, 16);

    expect(() =>
      renderGlEnvironmentCapture(state, { x: 0, y: 0, z: 0 }, scene, NO_LIGHTS, target, {
        excludeNode: excluded,
      }),
    ).toThrow('capture draw failed');
    expect(excluded.enabled).toBe(true);
    expect(gl.calls.filter((call) => call.name === 'bindFramebuffer').at(-1)?.args).toEqual([
      gl.FRAMEBUFFER,
      previousFramebuffer,
    ]);
    expect(gl.calls.filter((call) => call.name === 'activeTexture').at(-1)?.args).toEqual([activeTexture]);
    destroyGlCubeRenderTarget(state, target);
  });
});
