import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap, Camera3D, Material, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  copyQuaternion,
  createAmbientLight,
  createCamera3D,
  createDepthMaterial,
  createDirectionalLight,
  createMatcapMaterial,
  createMesh,
  createMeshGeometry,
  createNode3D,
  createNormalMaterial,
  createOrthographicProjection,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createSkeleton3D,
  createVector3,
  createWgpuAcquisition,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  createWireframeMaterial,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  prepareScene3DSkinning,
  scene3DWgpuPipeline,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field, four separate slender bars stand in columns centred near x=127, ' +
    '309, 491 and 673. Every bar has a vertical lower half and an upper arm bent about 75 degrees ' +
    'toward screen-left; none remains a straight upright column. From left to right the same posed ' +
    'silhouette appears as a filled mid-grey depth shade, a direction-encoded normal colour, a ' +
    'cyan-blue matcap shade and a thin white wireframe. The four treatments remain distinct, the ' +
    "leaned arms stay attached to their bases, and no bar crosses into its neighbour's column.",
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear, 'linear');
  prepareScene3DSkinning(scene);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuRenderEffectPipeline(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

// Three square rings form a vertical bar. The top ring is fully weighted to the bend joint; the two
// lower rings remain on the root. The canonical 20-float layout supplies the palette influence slots
// at joints0/weights0 which every skinned family variant must bind.
const halfWidth = 0.22;
const ringY = [0, 1, 2];
const ringJoint = [0, 0, 1];
const cornerX = [-halfWidth, halfWidth, halfWidth, -halfWidth];
const cornerZ = [-halfWidth, -halfWidth, halfWidth, halfWidth];
const stride = 20;
const vertices = new Float32Array(ringY.length * 4 * stride);
for (let r = 0; r < ringY.length; r++) {
  for (let c = 0; c < 4; c++) {
    const base = (r * 4 + c) * stride;
    vertices[base] = cornerX[c];
    vertices[base + 1] = ringY[r];
    vertices[base + 2] = cornerZ[c];
    vertices[base + 3] = cornerX[c];
    vertices[base + 5] = cornerZ[c];
    vertices[base + 8] = 1;
    vertices[base + 12] = ringJoint[r];
    vertices[base + 16] = 1;
  }
}

const indices: number[] = [];
for (let r = 0; r < ringY.length - 1; r++) {
  for (let c = 0; c < 4; c++) {
    const a = r * 4 + c;
    const b = r * 4 + ((c + 1) % 4);
    const a2 = (r + 1) * 4 + c;
    const b2 = (r + 1) * 4 + ((c + 1) % 4);
    indices.push(a, b, b2, a, b2, a2);
  }
}

const root = createNode3D();
const bend = createNode3D();
setVector3(bend.position, 0, 1, 0);
invalidateNodeLocalTransform(bend);
addNodeChild(root, bend);
const skeleton = createSkeleton3D([root, bend]);
const rotation = createQuaternion();
setQuaternionFromAxisAngle(rotation, createVector3(0, 0, 1), (75 * Math.PI) / 180);
copyQuaternion(bend.rotation, rotation);
invalidateNodeLocalTransform(bend);

const scene = createScene3D().root;
addNodeChild(scene, root);
const materials: readonly Material[] = [
  // The camera sits five view units away; bracket the bar around that real view-axis depth so the
  // orthographic Depth output remains mid-gray and this scene can keep measuring its posed silhouette.
  createDepthMaterial({ far: 6, near: 4 }),
  createNormalMaterial(),
  createMatcapMaterial({ tint: 0x40a0e0ff }),
  createWireframeMaterial({ color: 0xffffffff }),
];
const centers = [-3, -1, 1, 3];
for (let i = 0; i < materials.length; i++) {
  const geometry = createMeshGeometry({
    indices: new Uint16Array(indices),
    layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
    vertices: new Float32Array(vertices),
  });
  const mesh = createMesh(geometry, [materials[i]]);
  mesh.skin = { skeleton };
  mesh.position.x = centers[i];
  invalidateNodeLocalTransform(mesh);
  addNodeChild(scene, mesh);
}

const halfViewWidth = 4.4;
const halfViewHeight = 1.8;
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: halfViewHeight, halfWidth: halfViewWidth }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 1, 5), createVector3(0, 1, 0), createVector3(0, 1, 0));

const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, 0, -1), intensity: 0 }),
});
render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const worldToPixelX = (x: number): number => Math.round(((x + halfViewWidth) / (2 * halfViewWidth)) * bitmap.width);
  const worldToPixelY = (y: number): number =>
    Math.round(((halfViewHeight - (y - 1)) / (2 * halfViewHeight)) * bitmap.height);
  const targetY = worldToPixelY(1.25);

  for (let i = 0; i < centers.length; i++) {
    const targetX = worldToPixelX(centers[i] - 0.7);
    let covered = false;
    // Search a small patch because the wireframe family contributes 1px lines rather than a fill.
    for (let y = targetY - 24; y <= targetY + 24 && !covered; y++) {
      for (let x = targetX - 20; x <= targetX + 20; x++) {
        if (getBitmapPixelLuminance(bitmap, x, y) > 30) {
          covered = true;
          break;
        }
      }
    }
    if (!covered) {
      throw new Error(
        `[scene-skin-material-families] ${['Depth', 'Normal', 'Matcap', 'Wireframe'][i]} stayed in the rigid bind-pose column`,
      );
    }
  }
}
