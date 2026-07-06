// Requires: assets/wabbit_alpha.png
// Port of CacheBitmapTest3. Bitmap + rich text sliding with alpha animation.
// Flight render cache: call createRenderCache() + useRenderCache(state, node, cache) to opt any
// node into bitmap caching; see the blur functional test for the full bake-once pattern.
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createRichText,
  createShape,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xff000000,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});

function pos(i: number): number {
  return (i * height) / 720;
}

const root = createDisplayContainer();

const W = width;
const H = height;

const stageBg = createShape();
appendShapeBeginFill(stageBg, 0x000000);
appendShapeRectangle(stageBg, 0, 0, W, H);
addNodeChild(root, stageBg);

const image = await loadImageResourceFromUrl('assets/wabbit_alpha.png');

const posters = createDisplayContainer();

const bmp1 = createBitmap();
bmp1.data.image = image;
bmp1.data.smoothing = true;
bmp1.scaleX = pos(1.0);
bmp1.scaleY = pos(1.0);
addNodeChild(posters, bmp1);

const bmp2 = createBitmap();
bmp2.data.image = image;
bmp2.data.smoothing = true;
bmp2.alpha = 0.5;
bmp2.x = pos(125);
bmp2.scaleX = pos(1.0);
bmp2.scaleY = pos(1.0);
addNodeChild(posters, bmp2);

const bmp3 = createBitmap();
bmp3.data.image = image;
bmp3.data.smoothing = true;
bmp3.x = pos(250);
bmp3.scaleX = pos(1.0);
bmp3.scaleY = pos(1.0);
addNodeChild(posters, bmp3);

addNodeChild(root, posters);

const menuGroup = createDisplayContainer();

const menuBg = createShape();
appendShapeBeginFill(menuBg, 0xff22ff);
appendShapeRectangle(menuBg, pos(109), pos(186), pos(1171), pos(572));
appendShapeEndFill(menuBg);
addNodeChild(menuGroup, menuBg);

const title = createRichText();
title.data.defaultTextFormat = { font: 'sans-serif', size: pos(44), color: 0xe8c343 };
title.x = pos(109);
title.y = pos(186);
title.data.width = pos(500);
title.data.height = pos(60);
title.data.text = 'My Collection';
addNodeChild(menuGroup, title);

const menuItems = [
  'Lady and the Tramp',
  'The Adventures of Milo and Otis',
  'Mary Poppins',
  "Charlotte's Web",
  'The Secret World of Arrietty',
  'Babe',
  "It's a Wonderful Life",
  'Bringing Up Baby',
  'It Happened One Night',
];
for (let i = 0; i < menuItems.length; i++) {
  const item = createRichText();
  item.data.defaultTextFormat = { font: 'sans-serif', size: pos(28), color: 0xffffff };
  item.x = pos(109);
  item.y = pos(291 + i * 44);
  item.data.width = pos(1000);
  item.data.height = pos(40);
  item.data.text = menuItems[i];
  addNodeChild(menuGroup, item);
}
addNodeChild(root, menuGroup);

const statusLabel = createRichText();
statusLabel.data.defaultTextFormat = { font: 'sans-serif', size: pos(28), color: 0xe8c343 };
statusLabel.x = 0;
statusLabel.y = 0;
statusLabel.data.width = pos(400);
statusLabel.data.height = pos(40);
statusLabel.data.text = 'render cache: OFF';
addNodeChild(root, statusLabel);

let menuX = 0;
let menuXInc = pos(5);
const maxX = pos(640);
let cacheEnabled = false;
let lastToggle = performance.now();
const TOGGLE_MS = 3000;

function enterFrame(): void {
  const now = performance.now();
  menuX += menuXInc;
  if (menuX <= 0 || menuX >= maxX) menuXInc = -menuXInc;

  const alpha = (maxX - menuX) / maxX;
  posters.x = menuX;
  menuGroup.x = menuX;
  menuGroup.alpha = alpha;
  posters.alpha = alpha;
  invalidateNodeLocalTransform(posters);
  invalidateNodeLocalTransform(menuGroup);
  invalidateNodeAppearance(menuGroup);
  invalidateNodeAppearance(posters);

  if (now - lastToggle >= TOGGLE_MS) {
    lastToggle = now;
    cacheEnabled = !cacheEnabled;
    statusLabel.data.text = cacheEnabled ? 'render cache: ON' : 'render cache: OFF';
    invalidateNodeAppearance(statusLabel);
  }

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
