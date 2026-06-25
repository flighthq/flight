// node-visibility-inheritance — validates that `visible = false` on a CONTAINER propagates down to its
// descendants: a hidden container's children must not render even though the children are themselves
// visible.
//
// This needs a real render because inherited visibility is emergent from the scene-graph walk, not a
// local flag on the drawn node. Two containers each hold one opaque filled shape at a known world
// position. Both shapes are individually `visible`, but one container has `.visible = false` (followed
// by invalidateNodeAppearance, since visibility is an appearance field) — so the walk must prune that
// whole subtree. The oracle samples (1) the visible container's child region (must read its color) and
// (2) the hidden container's child region (must read background). A pass proves visibility reaches
// descendants, not just the node it is set on. jsdom unit tests cannot observe this gating because there
// are no rendered pixels to suppress.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  getSurfacePixelRgb,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const SHAPE_W = 200;
const SHAPE_H = 200;

// Visible container's child (red) — left region. The shape is drawn at this absolute position; its
// container has no transform, so world position equals these coords.
const VISIBLE_CHILD_X = 120;
const VISIBLE_CHILD_Y = 200;
const VISIBLE_FILL = 0xff0000; // red

// Hidden container's child (green) — right region, fully separate.
const HIDDEN_CHILD_X = 480;
const HIDDEN_CHILD_Y = 200;
const HIDDEN_FILL = 0x00ff00; // green

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
});

const root = createDisplayContainer();

// Visible container with a red child shape.
const visibleContainer = createDisplayContainer();
addNodeChild(root, visibleContainer);

const visibleChild = createShape();
appendShapeBeginFill(visibleChild, VISIBLE_FILL, 1);
appendShapeRectangle(visibleChild, VISIBLE_CHILD_X, VISIBLE_CHILD_Y, SHAPE_W, SHAPE_H);
appendShapeEndFill(visibleChild);
addNodeChild(visibleContainer, visibleChild);

// Hidden container with a green child shape. The CHILD stays visible; only the CONTAINER is hidden,
// so the child must be pruned by inherited visibility.
const hiddenContainer = createDisplayContainer();
hiddenContainer.visible = false; // hides the whole subtree
invalidateNodeAppearance(hiddenContainer);
addNodeChild(root, hiddenContainer);

const hiddenChild = createShape();
appendShapeBeginFill(hiddenChild, HIDDEN_FILL, 1);
appendShapeRectangle(hiddenChild, HIDDEN_CHILD_X, HIDDEN_CHILD_Y, SHAPE_W, SHAPE_H);
appendShapeEndFill(hiddenChild);
addNodeChild(hiddenContainer, hiddenChild);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // 1) Center of the visible container's child: must read its red fill.
  const visibleCenter = at(VISIBLE_CHILD_X + SHAPE_W / 2, VISIBLE_CHILD_Y + SHAPE_H / 2);
  if (!isRed(visibleCenter)) {
    throw new Error(`[node-visibility-inheritance] visible container child not red — got #${hex(visibleCenter)}`);
  }

  // 2) Center of the hidden container's child: must read background. If visibility did NOT inherit, the
  //    individually-visible green child would still draw here — so green here is the failure signal.
  const hiddenCenter = at(HIDDEN_CHILD_X + SHAPE_W / 2, HIDDEN_CHILD_Y + SHAPE_H / 2);
  if (!isBackground(hiddenCenter)) {
    throw new Error(
      `[node-visibility-inheritance] hidden container child drew (expected background) — got #${hex(hiddenCenter)}`,
    );
  }

  // 3) An untouched area: background, proving nothing leaked.
  const empty = at(400, 520);
  if (!isBackground(empty)) {
    throw new Error(`[node-visibility-inheritance] empty area not background — got #${hex(empty)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 180 && channel(rgb, 8) < 90 && channel(rgb, 0) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
