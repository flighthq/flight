import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createDisplayObject,
  createMesh,
  createPerspectiveProjection,
  createPhongMaterial,
  createRenderTexture,
  createShape,
  createSprite,
  createVector3,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  registerGlPhongMaterial,
  renderIntoGlRenderTexture,
  setCamera3DViewMatrix4FromLookAt,
  ShapeKind,
  SpriteKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;
const NODE_X = 220;
const NODE_Y = 160;
const NODE_WIDTH = 360;
const NODE_HEIGHT = 280;

const target = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x101018ff,
  kinds: [ShapeKind, SpriteKind],
});
if (target.kind !== 'webgl') throw new Error('render-target-node-2d requires WebGL');
const { render, state, width } = target;

registerGlPhongMaterial(state);

const scene = createScene3D().root;
const cube = createMesh(createBoxMeshGeometry(1.3, 1.3, 1.3), [
  createPhongMaterial({
    diffuse: 0x3ca8e8ff,
    shininess: 40,
    specular: 0xb0e8ffff,
  }),
]);
addNodeChild(scene, cube);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({
    aspect: NODE_WIDTH / NODE_HEIGHT,
    fovY: Math.PI / 4,
  }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(2.2, 1.6, 3.2), createVector3(0, 0, 0), createVector3(0, 1, 0));

const direction = createVector3(-1, -0.7, -0.8);
normalizeVector3(direction, direction);
const lights = {
  ambient: createAmbientLight({ color: 0x506080ff, intensity: 0.35 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 2.5 }),
};

const root = createDisplayObject();

const backing = createShape();
appendShapeBeginFill(backing, 0x175d6bff, 1);
appendShapeRectangle(backing, 160, 100, 480, 400);
appendShapeEndFill(backing);
addNodeChild(root, backing);

const renderTexture = createRenderTexture({
  clearColors: [0x05070dff],
  depth: 'depth-stencil',
  height: NODE_HEIGHT,
  width: NODE_WIDTH,
});
const renderTargetNode = createSprite({ data: { texture: renderTexture } });
renderTargetNode.x = NODE_X;
renderTargetNode.y = NODE_Y;
invalidateNodeLocalTransform(renderTargetNode);
addNodeChild(root, renderTargetNode);

const foreground = createShape();
appendShapeBeginFill(foreground, 0xffc928ff, 1);
appendShapeRectangle(foreground, 520, 400, 120, 50);
appendShapeEndFill(foreground);
addNodeChild(root, foreground);

renderIntoGlRenderTexture(state, renderTexture, (glState) => {
  prepareScene3DRender(glState, scene, camera, lights);
  drawGlScene3D(glState, scene, camera, lights);
});
render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  const cubeCenter = at(NODE_X + NODE_WIDTH / 2, NODE_Y + NODE_HEIGHT / 2);
  if (
    getBitmapPixelLuminance(
      frame,
      Math.round((NODE_X + NODE_WIDTH / 2) * scale),
      Math.round((NODE_Y + NODE_HEIGHT / 2) * scale),
    ) < 35
  ) {
    throw new Error(`[render-target-node-2d] offscreen 3D cube center is blank — got #${hex(cubeCenter)}`);
  }

  const targetCorner = at(NODE_X + 15, NODE_Y + 15);
  if (!isBackground(targetCorner)) {
    throw new Error(
      `[render-target-node-2d] node target did not cover the backing shape at its corner — got #${hex(targetCorner)}`,
    );
  }

  const backingOnly = at(180, 120);
  if (!isTeal(backingOnly)) {
    throw new Error(
      `[render-target-node-2d] earlier sibling did not render around the target — got #${hex(backingOnly)}`,
    );
  }

  const foregroundOverlap = at(540, 420);
  if (!isYellow(foregroundOverlap)) {
    throw new Error(
      `[render-target-node-2d] later sibling did not composite above the target — got #${hex(foregroundOverlap)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}

function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 45 && channel(rgb, 8) < 45 && channel(rgb, 0) < 55;
}

function isTeal(rgb: number): boolean {
  return channel(rgb, 8) > 65 && channel(rgb, 0) > 75 && channel(rgb, 16) < 65;
}

function isYellow(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) > 140 && channel(rgb, 0) < 90;
}
