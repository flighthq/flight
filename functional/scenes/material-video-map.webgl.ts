import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  advanceVideoTexture,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createUnlitMaterial,
  createVideoResource,
  createVideoTexture,
  createVector3,
  getBitmapPixelRgb,
  prepareScene3DRender,
  registerStandardGlTextureResolvers,
  registerGlUnlitMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'A horizontal plane (2×1) textured with a synthetic 2×1 video frame: the left half is red (0xff0000), the right half is blue (0x0000ff). The plane fills most of the view under an orthographic camera looking straight down from above. Black background (0x000000). No lighting response — the material is unlit, so the video colors appear at full saturation.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = createGlRenderState(canvas, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
  backgroundColor: 0x000000ff,
});
registerStandardGlTextureResolvers(state);
registerGlUnlitMaterial(state);
export const scale = pixelRatio;
export const width = 800;
export const height = 600;

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

renderGlBackground(state);
prepareScene3DRender(state, scene, camera, lights);
drawGlScene3D(state, scene, camera, lights);

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
