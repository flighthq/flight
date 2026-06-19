// Requires: assets/wabbit_alpha.png
// Port of MaskTest1, migrated from the retired MaskGroup to the clip API. Masking is now a geometric
// ClipRegion set via setDisplayObjectClip; the old bitmap-alpha mask (a soft mask) is a future
// MatteFilter, out of scope here. This test exercises the CONTOUR clip form (a circle path → flattened
// contours → stencil-then-cover on the GPU, native ctx.clip on canvas), which is what replaced the
// per-kind mask renderers. Each bitmap is clipped to a circle at various offsets; ghosts at 30% opacity
// show the unclipped bitmap so the clip boundary is visible.
import {
  addNodeChild,
  appendPathCubicCurveTo,
  appendPathMoveTo,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  BitmapKind,
  createBitmap,
  createClipRegionFromPath,
  createDisplayContainer,
  createPath,
  createShape,
  loadImageResourceFromURL,
  type Path,
  setDisplayObjectClip,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  clip: true,
  kinds: [BitmapKind, ShapeKind],
});

// Cubic-bezier circle in `path`'s local space, centered (cx,cy) radius r. Four arcs, kappa control.
const KAPPA = 0.5522847498307936;
function appendCirclePath(path: Path, cx: number, cy: number, r: number): void {
  const k = r * KAPPA;
  appendPathMoveTo(path, cx + r, cy);
  appendPathCubicCurveTo(path, cx + r, cy + k, cx + k, cy + r, cx, cy + r);
  appendPathCubicCurveTo(path, cx - k, cy + r, cx - r, cy + k, cx - r, cy);
  appendPathCubicCurveTo(path, cx - r, cy - k, cx - k, cy - r, cx, cy - r);
  appendPathCubicCurveTo(path, cx + k, cy - r, cx + r, cy - k, cx + r, cy);
}

const root = createDisplayContainer();

const W = width;
const H = height;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
appendShapeEndFill(bg);
addNodeChild(root, bg);

const image = await loadImageResourceFromURL('assets/wabbit_alpha.png');
const iw = image.width;
const ih = image.height;

// 4 clipped bitmaps in a 2x2 grid. Each is clipped to a circle in its own local space; the circle is
// offset to show the clip boundary. Clip-local space matches the bitmap's local space (the node's
// world transform is applied to the clip geometry by the backend clip hook).
const clipOffsets = [
  { dx: 0, dy: 0 },
  { dx: -10, dy: -10 },
  { dx: iw / 4, dy: ih / 4 },
  { dx: W * 10, dy: H * 10 },
];

for (let i = 0; i < 4; i++) {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const cx = col * (W / 3) + W / 6 - iw / 2;
  const cy = row === 0 ? ih / 2 : H / 2 + ih / 2;

  // Ghost at the bitmap position, unclipped, dim.
  const ghost = createBitmap();
  ghost.data.image = image;
  ghost.data.smoothing = true;
  ghost.alpha = 0.3;
  ghost.x = cx;
  ghost.y = cy;
  addNodeChild(root, ghost);

  // Clipped bitmap.
  const bmp = createBitmap();
  bmp.data.image = image;
  bmp.data.smoothing = true;
  bmp.x = cx;
  bmp.y = cy;
  addNodeChild(root, bmp);

  const circle = createPath();
  appendCirclePath(circle, iw / 2 + clipOffsets[i].dx, ih / 2 + clipOffsets[i].dy, Math.min(iw, ih) / 2);
  setDisplayObjectClip(bmp, createClipRegionFromPath(circle));
}

render(root);
