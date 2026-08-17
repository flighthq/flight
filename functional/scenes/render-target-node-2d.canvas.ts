import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayObject,
  createRenderTexture,
  createShape,
  createSprite,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  renderIntoCanvasRenderTexture,
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
  expectedImageDescription:
    'On a very dark blue-gray field (800×600): a teal backing rectangle at (160, 100), size ' +
    '480×400. Inside the backing, a 360×280 render-texture region at (220, 160) with a near-' +
    'black interior containing an isometric cube drawn with three flat-shaded faces — a light ' +
    'blue diamond-shaped top face, a medium-blue left face, and a brighter-blue right face. The ' +
    'cube sits roughly centered in the render texture. In front of the backing, a yellow ' +
    'rectangle at (520, 400), size 120×50. The teal backing is visible around the render ' +
    'texture. No gradient within individual faces — each face is a single flat blue tone.',
});
if (target.kind !== 'canvas') throw new Error('render-target-node-2d requires Canvas');
const { render, state, width } = target;

const root = createDisplayObject();

const backing = createShape();
appendShapeBeginFill(backing, 0x175d6bff, 1);
appendShapeRectangle(backing, 160, 100, 480, 400);
appendShapeEndFill(backing);
addNodeChild(root, backing);

const renderTexture = createRenderTexture({
  width: NODE_WIDTH,
  height: NODE_HEIGHT,
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

renderIntoCanvasRenderTexture(state, renderTexture, (canvasState) => {
  const context = canvasState.context;
  context.fillStyle = '#05070d';
  context.fillRect(0, 0, NODE_WIDTH, NODE_HEIGHT);

  context.beginPath();
  context.moveTo(180, 55);
  context.lineTo(280, 105);
  context.lineTo(180, 155);
  context.lineTo(80, 105);
  context.closePath();
  context.fillStyle = '#8ddcff';
  context.fill();

  context.beginPath();
  context.moveTo(80, 105);
  context.lineTo(180, 155);
  context.lineTo(180, 250);
  context.lineTo(80, 200);
  context.closePath();
  context.fillStyle = '#247caf';
  context.fill();

  context.beginPath();
  context.moveTo(180, 155);
  context.lineTo(280, 105);
  context.lineTo(280, 200);
  context.lineTo(180, 250);
  context.closePath();
  context.fillStyle = '#3ca8e8';
  context.fill();
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
    throw new Error(`[render-target-node-2d] offscreen 2D fill center is blank — got #${hex(cubeCenter)}`);
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
