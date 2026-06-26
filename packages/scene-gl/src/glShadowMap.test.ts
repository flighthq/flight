import { createCamera, createOrthographicProjection, setCameraViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createScene } from '@flighthq/scene';
import { EntityRuntimeKey } from '@flighthq/types';

import { getGlSceneRuntime } from './glSceneRuntime';
import { makeGlSceneState } from './glSceneTestHelper';
import { drawGlSceneShadowMap } from './glShadowMap';

function makeShadowState() {
  const { state, gl } = makeGlSceneState();

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
  const camera = createCamera({
    far: 100,
    near: 0.1,
    projection: createOrthographicProjection({ halfHeight: 10, halfWidth: 10 }),
  });
  setCameraViewMatrix4FromLookAt(camera, createVector3(0, 10, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));
  return camera;
}

describe('drawGlSceneShadowMap', () => {
  it('lazily creates the shadow target on the first call', () => {
    const { state } = makeShadowState();
    const scene = createScene();
    const camera = makeShadowCamera();

    drawGlSceneShadowMap(state, scene, camera);

    expect(getGlSceneRuntime(state).shadowTarget).not.toBeNull();
  });

  it('reuses the same shadow target on subsequent calls', () => {
    const { state } = makeShadowState();
    const scene = createScene();
    const camera = makeShadowCamera();

    drawGlSceneShadowMap(state, scene, camera);
    const firstTarget = getGlSceneRuntime(state).shadowTarget;

    drawGlSceneShadowMap(state, scene, camera);
    const secondTarget = getGlSceneRuntime(state).shadowTarget;

    expect(secondTarget).toBe(firstTarget);
  });

  it('records the light-space matrix on the runtime', () => {
    const { state } = makeShadowState();
    const scene = createScene();
    const camera = makeShadowCamera();

    drawGlSceneShadowMap(state, scene, camera);

    const shadow = getGlSceneRuntime(state).shadow;
    expect(shadow).not.toBeNull();
    expect(shadow!.matrix).not.toBeNull();
  });

  it('sets up the depth pass with front-face culling', () => {
    const { state, gl } = makeShadowState();
    const scene = createScene();
    const camera = makeShadowCamera();

    drawGlSceneShadowMap(state, scene, camera);

    const frontValue = (gl as unknown as Record<string, number>)['FRONT'];
    const cullFaceCall = gl.calls.find((c) => c.name === 'cullFace' && c.args[0] === frontValue);
    expect(cullFaceCall).toBeDefined();

    const cullFaceConstant = (gl as unknown as Record<string, number>)['CULL_FACE'];
    const enableCullFaceCall = gl.calls.find((c) => c.name === 'enable' && c.args[0] === cullFaceConstant);
    expect(enableCullFaceCall).toBeDefined();
  });

  it('restores the previous framebuffer after the depth pass', () => {
    const { state, gl } = makeShadowState();
    const scene = createScene();
    const camera = makeShadowCamera();

    drawGlSceneShadowMap(state, scene, camera);

    const framebufferConstant = (gl as unknown as Record<string, number>)['FRAMEBUFFER'];
    const bindFramebufferCalls = gl.calls.filter((c) => c.name === 'bindFramebuffer');
    const lastBindFramebuffer = bindFramebufferCalls[bindFramebufferCalls.length - 1];

    expect(lastBindFramebuffer).toBeDefined();
    expect(lastBindFramebuffer.args[0]).toBe(framebufferConstant);
    expect(lastBindFramebuffer.args[1]).toBeNull();
  });
});
