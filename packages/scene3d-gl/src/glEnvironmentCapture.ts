import { createCamera3D, createPerspectiveProjection, getCubeCaptureFaceCamera3D } from '@flighthq/camera/contract';
import { beginGlCubeRenderFace, endGlCubeRenderFace } from '@flighthq/render-gl/contract';
import type {
  Camera3D,
  GlCubeRenderTarget,
  GlEnvironmentCaptureOptions,
  GlRenderState,
  Node3D,
  Scene3DLightsLike,
  Vector3Like,
} from '@flighthq/types/contract';

import { drawGlScene3D } from './drawGlScene3D';

// Returns the backend-native cubemap produced by renderGlEnvironmentCapture. The handle can be bound
// directly for GL-only sampling; bakeGlEnvironmentCaptureIbl is the higher-level bridge into Flight's
// state-scoped PBR image-based-lighting path.
export function getGlEnvironmentCaptureTexture(target: Readonly<GlCubeRenderTarget>): WebGLTexture {
  return target.texture;
}

// Renders `scene` synchronously into all six faces of `cubeTarget` from `position`. Face cameras use
// the camera package's canonical +X, -X, +Y, -Y, +Z, -Z orientations and a square 90-degree field of
// view. The caller owns capture cadence; one call always completes all six faces.
export function renderGlEnvironmentCapture(
  state: GlRenderState,
  position: Readonly<Vector3Like>,
  scene: Readonly<Node3D>,
  lights: Readonly<Scene3DLightsLike>,
  cubeTarget: GlCubeRenderTarget,
  options?: Readonly<GlEnvironmentCaptureOptions>,
): void {
  const gl = state.gl;
  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
  const camera = getGlEnvironmentCaptureCamera(state);
  camera.near = options?.near ?? DEFAULT_ENVIRONMENT_CAPTURE_NEAR;
  camera.far = options?.far ?? DEFAULT_ENVIRONMENT_CAPTURE_FAR;

  const excluded = options?.excludeNode;
  const excludedEnabled = excluded?.enabled;
  // Exclusion is a synchronous draw-only override. Direct assignment deliberately avoids publishing
  // node-change signals for a state that never becomes observable outside this bracket.
  if (excluded !== undefined) excluded.enabled = false;
  try {
    for (let face = 0; face < 6; face++) {
      getCubeCaptureFaceCamera3D(camera, position, face);
      beginGlCubeRenderFace(state, cubeTarget, face);
      try {
        drawGlScene3D(state, scene, camera, lights);
      } finally {
        endGlCubeRenderFace(state);
      }
    }
  } finally {
    if (excluded !== undefined) excluded.enabled = excludedEnabled!;
    gl.activeTexture(previousActiveTexture);
  }
}

function getGlEnvironmentCaptureCamera(state: GlRenderState): Camera3D {
  let camera = glEnvironmentCaptureCameras.get(state);
  if (camera === undefined) {
    camera = createCamera3D({
      far: DEFAULT_ENVIRONMENT_CAPTURE_FAR,
      near: DEFAULT_ENVIRONMENT_CAPTURE_NEAR,
      projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI * 0.5 }),
    });
    glEnvironmentCaptureCameras.set(state, camera);
  }
  return camera;
}

const DEFAULT_ENVIRONMENT_CAPTURE_FAR = 1000;
const DEFAULT_ENVIRONMENT_CAPTURE_NEAR = 0.1;
const glEnvironmentCaptureCameras = new WeakMap<GlRenderState, Camera3D>();
