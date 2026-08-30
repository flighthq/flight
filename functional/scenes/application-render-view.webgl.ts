import { attachApplicationRenderView, createApplicationWindow } from '@flighthq/application';
import { createGlApplicationRenderView } from '@flighthq/application-gl';
import { getBitmapPixelRgb } from '@flighthq/bitmap';
import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createVector3 } from '@flighthq/geometry';
import { createAmbientLight } from '@flighthq/lighting';
import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { prepareScene3DRender } from '@flighthq/render';
import { beginGlRenderPass, endGlRenderPass, renderGlBackground } from '@flighthq/render-gl';
import { presentGlRenderTarget } from '@flighthq/render-gl/contract';
import { scene2dGlPipeline } from '@flighthq/scene2d-gl';
import { createMesh, createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D, registerGlUnlitMaterial } from '@flighthq/scene3d-gl';
import { emitSignal } from '@flighthq/signals';
import type { Bitmap } from '@flighthq/types';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a very dark blue background — not black — filled edge to edge, with a single solid cyan ' +
    'cube centred in it, seen in perspective from above, to its right and in front, so THREE faces are visible at ' +
    'once — its front, its right side and its top. All three are the SAME flat cyan with no brightness difference ' +
    'between them: the cube ignores scene lighting entirely, so any face darker than another is wrong. Its ' +
    'silhouette spans x 217-562 and y 159-496 — 345 px across and 337 px tall, which is 0.43*W by 0.56*H, so it ' +
    'covers rather more than a third of the width and over half the height; the eight corners of the 1.6-unit ' +
    'cube project through the camera at (2.3,1.5,4) with fovY = pi/4, and those are their extremes. Everything ' +
    'outside it is the dark blue background, in particular near (32,32) — the window is resized after the view is ' +
    'attached, and the background must still reach that corner rather than leaving the pre-resize extent visible.',
);
export const width = 800;
export const height = 600;
export const scale = window.devicePixelRatio || 1;

const applicationWindow = createApplicationWindow();
applicationWindow.width = width / 2;
applicationWindow.height = height / 2;
applicationWindow.devicePixelRatio = scale;

const canvas = document.createElement('canvas');
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
document.body.appendChild(canvas);

const view = createGlApplicationRenderView(applicationWindow, canvas, {
  context: {
    contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
  },
  pipeline: scene2dGlPipeline,
  render: {
    backgroundColor: 0x101522ff,
  },
  target: {
    colorSpace: 'srgb',
    depth: 'depth-stencil',
    sampleCount: 1,
  },
});
attachApplicationRenderView(view);

applicationWindow.width = width;
applicationWindow.height = height;
emitSignal(applicationWindow.onResize);

const expectedWidth = width * scale;
const expectedHeight = height * scale;
if (
  canvas.width !== expectedWidth ||
  canvas.height !== expectedHeight ||
  view.renderTarget.width !== expectedWidth ||
  view.renderTarget.height !== expectedHeight ||
  view.viewport.width !== expectedWidth ||
  view.viewport.height !== expectedHeight
) {
  throw new Error('[application-render-view] window resize did not synchronize canvas, target, and viewport extents');
}

registerGlUnlitMaterial(view.renderState);
const scene = createScene3D().root;
addNodeChild(scene, createMesh(createBoxMeshGeometry(1.6, 1.6, 1.6), [createUnlitMaterial({ baseColor: 0x37bde8ff })]));
const camera = createCamera3D({
  far: 20,
  near: 0.1,
  projection: createPerspectiveProjection({
    aspect: view.viewport.width / view.viewport.height,
    fovY: Math.PI / 4,
  }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(2.3, 1.5, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: null,
};

beginGlRenderPass(view.renderState, view.renderTarget);
renderGlBackground(view.renderState);
prepareScene3DRender(view.renderState, scene, camera, lights);
drawGlScene3D(view.renderState, scene, camera, lights);
endGlRenderPass(view.renderState);
presentGlRenderTarget(view.renderState, view.renderTarget);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const center = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2));
  if (!isCyan(center)) {
    throw new Error(`[application-render-view] synchronized target draw is missing at center — got #${hex(center)}`);
  }
  const margin = Math.floor(bitmap.width * 0.04);
  const corner = getBitmapPixelRgb(bitmap, margin, margin);
  if (channel(corner, 16) > 100 || channel(corner, 8) > 120 || channel(corner, 0) > 130) {
    throw new Error(
      `[application-render-view] resized target background did not remain bounded around the mesh — got #${hex(corner)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isCyan(rgb: number): boolean {
  const red = channel(rgb, 16);
  const green = channel(rgb, 8);
  const blue = channel(rgb, 0);
  return green > 120 && blue > 150 && red < 100;
}
