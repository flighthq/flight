import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  advanceVideoTexture,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createUnlitMaterial,
  createVideoResource,
  createVideoTexture,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderState,
  getBitmapPixelRgb,
  prepareScene3DRender,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'An 800×600 black field (0x000000) with a horizontal plane textured with a synthetic 2×1 video frame, viewed top-down under an orthographic camera. The plane fills x W*(0.5 ± 1/2.5) = 0.1*W–0.9*W = 80–720, y H*(0.5 ± 1/3) ≈ 100–500. The left half is red (0xff0000) and the right half is blue (0x0000ff). The material is unlit, so the video colors appear at full saturation with no shading gradient.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x000000ff });
registerWgpuUnlitMaterial(state);
export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, scale);

const frame = document.createElement('canvas');
frame.width = 2;
frame.height = 1;
const context = frame.getContext('2d')!;
context.fillStyle = '#ff0000';
context.fillRect(0, 0, 1, 1);
context.fillStyle = '#0000ff';
context.fillRect(1, 0, 1, 1);
Object.defineProperties(frame, {
  readyState: { value: 4 },
  videoHeight: { value: 1 },
  videoWidth: { value: 2 },
});

const videoMap = createVideoTexture(createVideoResource(frame as unknown as HTMLVideoElement));
videoMap.sampler.magFilter = 'nearest';
videoMap.sampler.minFilter = 'nearest';
advanceVideoTexture(videoMap);

const scene = createScene3D().root;
addNodeChild(
  scene,
  createMesh(createPlaneMeshGeometry(2, 1), [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: videoMap })]),
);
const camera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 0.75, halfWidth: 1.25 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 2, 0), createVector3(0, 0, 0), createVector3(0, 0, -1));
const lights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, 0), intensity: 0 }),
};

renderWgpuBackground(state);
prepareScene3DRender(state, scene, camera, lights);
drawWgpuScene3D(state, scene, camera, lights);
submitWgpuRenderPass(state);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const sample = (x: number): number =>
    getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * x), Math.floor(bitmap.height * 0.5));
  const left = sample(0.35);
  const right = sample(0.65);
  const red = (rgb: number): boolean => ((rgb >> 16) & 255) > 180 && ((rgb >> 8) & 255) < 70 && (rgb & 255) < 70;
  const blue = (rgb: number): boolean => (rgb & 255) > 180 && ((rgb >> 16) & 255) < 70 && ((rgb >> 8) & 255) < 70;
  if (!((red(left) && blue(right)) || (blue(left) && red(right)))) {
    const hex = (rgb: number): string => (rgb & 0xffffff).toString(16).padStart(6, '0');
    throw new Error(
      `[material-video-map] expected distinct red/blue live-video halves, got #${hex(left)} and #${hex(right)}`,
    );
  }
}
