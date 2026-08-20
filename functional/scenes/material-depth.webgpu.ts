import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDepthMaterial,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuDepthMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single sphere centred in it, about 245 px across — D = ' +
    'H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H — centred at (0.5*W, 0.5*H) = (400,300), shaded by DISTANCE rather ' +
    'than by light: it is a grey gradient across the surface, DARKEST at the centre and rising steadily outward ' +
    'to its brightest at the silhouette — grey = (viewDepth - 2)/(4 - 2), so the centre at depth 3 - 0.5 = 2.5 ' +
    'gives 0.25 while the silhouette at depth ~2.92 gives ~0.46. Scanning outward from the centre the tone must ' +
    'VARY measurably rather than holding one value — a flat, evenly toned disc is the failure. There is no ' +
    'coloured tint, no specular highlight and no light-and-shadow split: the variation is purely front-to-back. ' +
    'The background stays near-black.',
);
// drawWgpuScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu both export it), so import
// the Wgpu one directly from its package.

// Wgpu parity column for the same sphere as render.webgl.ts. Wgpu state init is async.
// renderWgpuBackground opens the command encoder + clears; the effect pipeline runs between
// begin/end (Depth writes linear HDR into the rgba16f scene target, depth-tested), and
// submitWgpuRenderPass flushes. Frame capture is enabled (the software adapter never presents the
// swapchain headless) so the verifier reads the frame back from the GPU.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerWgpuDepthMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// material-depth — proves a DepthMaterial mesh renders as a VIEW-DEPTH GRADIENT on the Gl and Wgpu
// forward renderers, independent of scene lighting. A single sphere sits at the origin; DepthMaterial
// ignores lighting entirely and outputs eye-depth (remapped through near/far) as grayscale. The camera
// sits at z=3 looking at the origin and the sphere has radius 0.5, so its surface spans eye-depth ~2.5
// (the nearest point, dead center, pointing at the camera) to ~3.5 (the silhouette, farther away).
// near/far are deliberately set to { near: 2, far: 4 } to BRACKET that 2.5..3.5 band so the depth
// remap lands mid-gradient and the sphere reads as a visible near→far ramp rather than being crushed
// to a flat black or white fill.
//
// The signature the assertion checks: the center pixel (nearest surface) is clearly different in
// brightness from an on-sphere offset pixel (farther surface). A flat/uniform fill — the failure mode
// if depth were not being written — would show no such difference.
//
// app.ts is backend-agnostic: it builds the scene/camera/lights once and hands them to render(), whose
// per-backend implementation lives in render.webgl.ts / render.webgpu.ts.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so the depth gradient is a clean ramp, not faceted.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Depth output remapped through near=2 / far=4. The sphere surface spans eye-depth ~2.5..3.5 (camera at
// z=3, radius 0.5), so this range brackets it and the gradient stays visible rather than crushed.
const material = createDepthMaterial({ near: 2, far: 4 });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the sphere from +z, looking at the origin. Aspect matches the target so
// the sphere stays circular.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// The same directional + ambient rig as material-standard-pbr. DepthMaterial ignores both — they are
// passed through unused so the scaffold matches the lit materials.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
});

render(scene, camera, lights);

// Assertion: not blank + a real depth gradient across the sphere. The near→far ramp is subtle near the
// center (the surface is nearly fronto-parallel there) and only opens up toward the silhouette, so two
// near-center samples are not enough. Scan outward along +x, collecting on-sphere luminance until the
// scan crosses the silhouette into the dark background, then assert the on-sphere spread is non-flat —
// proof of a depth ramp rather than a flat fill.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);

  const center = getBitmapPixelLuminance(bitmap, cx, cy);
  if (center <= 16) {
    throw new Error(`[material-depth] bitmap is blank (center luminance ${center}) — mesh did not render`);
  }

  // The background is near-black; treat a sample at/under this as off the sphere and stop the scan
  // before it contaminates the on-sphere spread with the background step.
  const backgroundLuminance = 24;
  let minLuminance = center;
  let maxLuminance = center;
  const maxOffset = Math.floor(bitmap.width * 0.14);
  for (let dx = 8; dx <= maxOffset; dx += 8) {
    const sample = getBitmapPixelLuminance(bitmap, cx + dx, cy);
    if (sample <= backgroundLuminance) break;
    if (sample < minLuminance) minLuminance = sample;
    if (sample > maxLuminance) maxLuminance = sample;
  }

  if (maxLuminance - minLuminance <= 12) {
    throw new Error(
      `[material-depth] no depth gradient: on-sphere luminance is nearly flat (min ${minLuminance}, max ${maxLuminance}) — depth appears to be a flat fill`,
    );
  }
}

// Barrel so TypeScript resolves the `./render` import in app.ts; the functional harness routes it to the
// active backend's render.<renderer>.ts at runtime.
