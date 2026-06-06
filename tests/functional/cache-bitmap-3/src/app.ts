// Requires: assets/wabbit_alpha.png
// Port of CacheBitmapTest3. Tests bitmap + rich text sliding with alpha animation.
// cacheAsBitmap toggle replaced with a simple on/off label (not applicable in flight).
import {
  addSceneChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createBitmap,
  createDisplayContainer,
  createRichText,
  createShape,
  loadImageSourceFromURL,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

function pos(i: number): number {
  return (i * height) / (720 * scale);
}

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

const stageBg = createShape();
appendShapeBeginFill(stageBg, 0x000000);
appendShapeRectangle(stageBg, 0, 0, W, H);
addSceneChild(root, stageBg);

const image = await loadImageSourceFromURL('assets/wabbit_alpha.png');

const posters = createDisplayContainer();

const bmp1 = createBitmap();
bmp1.data.image = image;
bmp1.data.smoothing = true;
bmp1.scaleX = pos(1.0);
bmp1.scaleY = pos(1.0);
addSceneChild(posters, bmp1);

const bmp2 = createBitmap();
bmp2.data.image = image;
bmp2.data.smoothing = true;
bmp2.alpha = 0.5;
bmp2.x = pos(125);
bmp2.scaleX = pos(1.0);
bmp2.scaleY = pos(1.0);
addSceneChild(posters, bmp2);

const bmp3 = createBitmap();
bmp3.data.image = image;
bmp3.data.smoothing = true;
bmp3.x = pos(250);
bmp3.scaleX = pos(1.0);
bmp3.scaleY = pos(1.0);
addSceneChild(posters, bmp3);

addSceneChild(root, posters);

const menuGroup = createDisplayContainer();

const menuBg = createShape();
appendShapeBeginFill(menuBg, 0xff22ff);
appendShapeRectangle(menuBg, pos(109), pos(186), pos(1171), pos(572));
appendShapeEndFill(menuBg);
addSceneChild(menuGroup, menuBg);

const title = createRichText();
title.data.defaultTextFormat = { font: 'sans-serif', size: pos(44), color: 0xe8c343 };
title.x = pos(109);
title.y = pos(186);
title.data.width = pos(500);
title.data.height = pos(60);
title.data.text = 'My Collection';
addSceneChild(menuGroup, title);

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
  addSceneChild(menuGroup, item);
}
addSceneChild(root, menuGroup);

const statusLabel = createRichText();
statusLabel.data.defaultTextFormat = { font: 'sans-serif', size: pos(28), color: 0xe8c343 };
statusLabel.x = 0;
statusLabel.y = 0;
statusLabel.data.width = pos(400);
statusLabel.data.height = pos(40);
statusLabel.data.text = 'cacheAsBitmap: n/a';
addSceneChild(root, statusLabel);

let menuX = 0;
let menuXInc = pos(5);
const maxX = pos(640);

function enterFrame(): void {
  menuX += menuXInc;
  if (menuX <= 0 || menuX >= maxX) menuXInc = -menuXInc;

  const alpha = (maxX - menuX) / maxX;
  posters.x = menuX;
  menuGroup.x = menuX;
  menuGroup.alpha = alpha;
  posters.alpha = alpha;

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
