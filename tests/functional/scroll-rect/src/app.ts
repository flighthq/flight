// Requires: assets/OwlAlpha.png
// Demonstrates clip rectangle + child positioning as the compositional scroll pattern.
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createBitmap,
  createDisplayContainer,
  createRichText,
  createShape,
  invalidateNodeLocalTransform,
  loadImageResourceFromURL,
  setDisplayObjectClipRectangle,
} from '@flighthq/sdk';

import { height, render, width } from './render';

const FRAMES_PER_ROTATION = 200;
const RADIUS = 120;

function pos(i: number): number {
  return (i * height) / 720;
}

const root = createDisplayContainer();

const W = width;
const H = height;

const owlImg = await loadImageResourceFromURL('assets/OwlAlpha.png');

// Owl clip: container clips to the eyes region; content moves to pan across the image.
const owlClip = createDisplayContainer();
setDisplayObjectClipRectangle(owlClip, { x: 0, y: 0, width: 200, height: 250 });
owlClip.x = 100;
owlClip.y = 630;

const owlContent = createDisplayContainer();
owlContent.y = -300;
const owlBitmap = createBitmap();
owlBitmap.data.image = owlImg;
owlBitmap.data.smoothing = true;
addNodeChild(owlContent, owlBitmap);
addNodeChild(owlClip, owlContent);

// Text list: container clips to the visible area; content moves to scroll.
const textFmt = { font: 'sans-serif', size: 28, color: 0xe8c343 };
const movies = [
  'The Shawshank Redemption (1994)',
  'The Godfather (1972)',
  'The Godfather: Part II (1974)',
  'Pulp Fiction (1994)',
  'The Good, the Bad and the Ugly (1966)',
  'The Dark Knight (2008)',
  '12 Angry Men (1957)',
  "Schindler's List (1993)",
  'The Lord of the Rings: The Return of the King (2003)',
  'Fight Club (1999)',
  'Star Wars: Episode V - The Empire Strikes Back (1980)',
  'The Lord of the Rings: The Fellowship of the Ring (2001)',
  "One Flew Over the Cuckoo's Nest (1975)",
  'Goodfellas (1990)',
  'Seven Samurai (1954)',
  'Inception (2010)',
  'Star Wars: Episode IV - A New Hope (1977)',
  'Forrest Gump (1994)',
  'The Matrix (1999)',
  'The Lord of the Rings: The Two Towers (2002)',
];

const CLIP_W = 400;
const CLIP_H = 300;

const textClip = createDisplayContainer();
setDisplayObjectClipRectangle(textClip, { x: 0, y: 0, width: CLIP_W, height: CLIP_H });
textClip.x = pos(300);
textClip.y = pos(350);

const textContent = createDisplayContainer();
addNodeChild(textClip, owlClip);
addNodeChild(textClip, textContent);

const textField = createRichText();
textField.data.defaultTextFormat = textFmt;
textField.data.width = pos(1280);
textField.data.height = pos(2000);
textField.data.multiline = true;
textField.data.wordWrap = false;
textField.data.text = movies.join('\n');
addNodeChild(textContent, textField);

// Border around text clip area
const outerSprite = createDisplayContainer();
const borderColor = 0xe8c343;
function addBorderRect(x: number, y: number, w: number, h: number): void {
  const s = createShape();
  appendShapeBeginFill(s, borderColor);
  appendShapeRectangle(s, x, y, w, h);
  appendShapeEndFill(s);
  addNodeChild(outerSprite, s);
}
addBorderRect(textClip.x - 2, textClip.y - 2, CLIP_W + 4, 2);
addBorderRect(textClip.x - 2, textClip.y - 2, 2, CLIP_H + 4);
addBorderRect(textClip.x + CLIP_W, textClip.y - 2, 2, CLIP_H + 4);
addBorderRect(textClip.x - 2, textClip.y + CLIP_H, CLIP_W + 4, 2);
addNodeChild(outerSprite, textClip);

// Outer clip: orbits by moving the content while the clip window stays fixed.
const outerClip = createDisplayContainer();
setDisplayObjectClipRectangle(outerClip, { x: 0, y: 0, width: W, height: H });
const outerContent = createDisplayContainer();
addNodeChild(outerContent, outerSprite);
addNodeChild(outerClip, outerContent);
addNodeChild(root, outerClip);

// Status label
const status = createRichText();
status.data.defaultTextFormat = textFmt;
status.x = 0;
status.y = 0;
status.data.width = pos(400);
status.data.height = pos(50);
status.data.text = 'clip rectangle test';
addNodeChild(root, status);

let inc = pos(5);
let owlInc = pos(5);
let owlScrollX = 0;
let textScrollY = 0;
let outerAngle = 0;
const outerInc = (2 * Math.PI) / FRAMES_PER_ROTATION;

function enterFrame(): void {
  textScrollY += inc;
  if (textScrollY >= pos(550)) inc = -pos(5);
  else if (textScrollY <= 0) inc = pos(5);
  textContent.y = -textScrollY;
  invalidateNodeLocalTransform(textContent);

  owlScrollX += owlInc;
  if (owlScrollX >= owlImg.width || owlScrollX <= 0) owlInc = -owlInc;
  owlContent.x = -owlScrollX;
  invalidateNodeLocalTransform(owlContent);

  outerAngle += outerInc;
  if (outerAngle > 2 * Math.PI) outerAngle -= 2 * Math.PI;
  const ox = RADIUS + RADIUS * Math.cos(outerAngle);
  const oy = RADIUS + RADIUS * Math.sin(outerAngle) + (720 - H) / 2;
  outerContent.x = -ox;
  outerContent.y = -oy;
  invalidateNodeLocalTransform(outerContent);

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
