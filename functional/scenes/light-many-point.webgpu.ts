import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, prepareWgpuScene3DForwardLights } from '@flighthq/scene3d-wgpu';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createBoxMeshGeometry,
  createCamera3D,
  createMesh,
  createOrthographicProjection,
  createPointLight,
  createScene3DLights,
  createSpotLight,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelRgb,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerWgpuBlinnPhongMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 field on a near-black background (0x080a10) carrying TWELVE SEPARATE SQUARE TILES in a 4-by-3 ' +
    'grid. They are the top faces of twelve boxes seen straight down by an orthographic camera 12 units above the ' +
    'origin — NOT pools of light on a continuous floor. There is no floor in this scene at all, so the dark gaps ' +
    'between the tiles are empty background, not shadow, and each tile has four hard straight edges rather than a ' +
    'soft falloff rim. The camera spans 12 x 9 world units, so a world size s maps to (s/12)*W horizontally and ' +
    '(s/9)*H vertically, and a box at world (x, z) lands at ((0.5 + x/12)*W, (0.5 + z/9)*H). Each 1.35 x 1.35 top ' +
    'face is therefore (1.35/12)*W = 90 px by (1.35/9)*H = 90 px, and the four columns at x = -4.5, -1.5, 1.5, ' +
    '4.5 sit at 100, 300, 500 and 700 px while the three rows at z = -2.5, 0, 2.5 sit at 133.3, 300 and 466.7 px. ' +
    'The gaps follow from the same two expressions: (3/12)*W - 90 = 110 px of background between horizontal ' +
    'neighbours and (2.5/9)*H - 90 = 76.7 px between vertical ones. Each tile carries its own point light 1.6 ' +
    'units above it, and the light colours cycle through warm red (0xff6040), cool blue (0x60a0ff), green ' +
    '(0x70ff80) and amber (0xffd060) along each row, shifted one step per row, so equal colours run in diagonals ' +
    'across the grid. Neighbouring lights do reach one another (spacing 3 against range 4.5), so each tile reads ' +
    'mostly as its own colour with a weaker wash of the adjacent ones rather than as a pure swatch. The tile at ' +
    '(300,300) is the exception and the brightest of the twelve: three overlapping spot lights, red plus green ' +
    'plus blue from one point 1.8 units above it, add to a near-white wash there. At least ten of the twelve must ' +
    'be clearly lit — a field with only three or four lit tiles is the failure this scene exists to catch, since ' +
    'that is what a fixed four-light budget produces, and one lit evenly corner to corner would mean geometry the ' +
    'scene does not contain.',
);
// WebGPU mirror of light-many-point.webgl. Four finite-range decoys come first; only per-mesh
// contribution selection can choose the twelve nearby lights and illuminate the field.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x080a10ff });
registerWgpuBlinnPhongMaterial(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 1,
});
export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, scale);

const material = createBlinnPhongMaterial({ diffuse: 0x707884ff, shininess: 24, specular: 0x282828ff });
const scene = createScene3D().root;
const pointLights = [];
const spotLights = [];
const colors = [0xff6040ff, 0x60a0ffff, 0x70ff80ff, 0xffd060ff];
for (let index = 0; index < 4; index++) {
  pointLights.push(
    createPointLight({
      color: colors[index],
      intensity: 40,
      position: { x: 40 + index * 5, y: 3, z: 40 },
      range: 5,
    }),
  );
}
const xPositions = [-4.5, -1.5, 1.5, 4.5];
const zPositions = [-2.5, 0, 2.5];
for (let row = 0; row < zPositions.length; row++) {
  for (let column = 0; column < xPositions.length; column++) {
    const x = xPositions[column];
    const z = zPositions[row];
    const mesh = createMesh(createBoxMeshGeometry(1.35, 0.6, 1.35), [material]);
    setVector3(mesh.position, x, 0.3, z);
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);
    pointLights.push(
      createPointLight({
        color: colors[(row + column) % colors.length],
        intensity: 32,
        position: { x, y: 2.2, z },
        range: 4.5,
      }),
    );
  }
}
for (const color of [0xff3030ff, 0x30ff30ff, 0x3030ffff]) {
  spotLights.push(
    createSpotLight({
      color,
      direction: { x: 0, y: -1, z: 0 },
      innerConeDegrees: 20,
      intensity: 18,
      outerConeDegrees: 38,
      position: { x: -1.5, y: 2.4, z: 0 },
      range: 4.5,
    }),
  );
}
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 4.5, halfWidth: 6 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 12, 0), createVector3(0, 0, 0), createVector3(0, 0, -1));
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x202838ff, intensity: 0.015 }),
  directional: null,
  point: pointLights,
  spot: spotLights,
});

renderWgpuBackground(state);
beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
const renderList = prepareScene3DRender(state, scene, camera, lights);
const forwardLights = prepareWgpuScene3DForwardLights(state, renderList, lights);
drawWgpuScene3D(state, scene, camera, lights, forwardLights);
endWgpuRenderEffectPipeline(state, pipeline, []);
submitWgpuRenderPass(state);

// Independently recorded row-major center fingerprint. Two clean captures were byte-identical at all
// twelve centers; the tolerance leaves room for small cross-driver float differences without accepting
// a neighbouring light color. The aggregate lit count below still proves that per-object selection beat
// first-four truncation, while these positions prove the selected lights remained attached to their tiles.
// MEASURED defeat: swapping the red and blue light definitions preserved all twelve lit centers but failed
// tile 0 as #9dd9ff versus expected #ff9199.
const EXPECTED_TILE_RGB = [
  0xff9199, 0x8ceeff, 0xaeffca, 0xffff93, 0x99eeff, 0xffffff, 0xffff9c, 0xffa392, 0x99ffd3, 0xffff9a, 0xff9f7c,
  0x9cd8ff,
] as const;
const MAX_TILE_CHANNEL_DELTA = 24;

export function assertRender(bitmap: Readonly<Bitmap>): void {
  let litCount = 0;
  for (let row = 0; row < zPositions.length; row++) {
    for (let column = 0; column < xPositions.length; column++) {
      const x = Math.round((0.5 + xPositions[column] / 12) * bitmap.width);
      const y = Math.round((0.5 + zPositions[row] / 9) * bitmap.height);
      const index = row * xPositions.length + column;
      const actual = getBitmapPixelRgb(bitmap, x, y);
      const expected = EXPECTED_TILE_RGB[index]!;
      const channelDelta = Math.max(
        Math.abs(((actual >> 16) & 255) - ((expected >> 16) & 255)),
        Math.abs(((actual >> 8) & 255) - ((expected >> 8) & 255)),
        Math.abs((actual & 255) - (expected & 255)),
      );
      if (channelDelta > MAX_TILE_CHANNEL_DELTA) {
        throw new Error(
          `[light-many-point] tile ${index} at (${x}, ${y}) is #${actual.toString(16).padStart(6, '0')} ` +
            `(expected #${expected.toString(16).padStart(6, '0')} within ${MAX_TILE_CHANNEL_DELTA} per channel) — ` +
            `the light colors moved between tiles or their contribution changed`,
        );
      }
      if (getBitmapPixelLuminance(bitmap, x, y) > 48) litCount++;
    }
  }
  if (litCount < 10) {
    throw new Error(`[light-many-point] only ${litCount}/12 meshes lit — per-object selection failed`);
  }
}
