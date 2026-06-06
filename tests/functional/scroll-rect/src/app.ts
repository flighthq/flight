// Requires: assets/wabbit_alpha.png, assets/OwlAlpha.png
// Port of ScrollRectTest1. Tests nested scrollRectangle clipping with animation.
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
  setDisplayObjectScrollRectangle,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const FRAMES_PER_ROTATION = 200;
const RADIUS = 120;

function pos(i: number): number {
  return (i * height) / (720 * scale);
}

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

const [/*openflImg,*/ owlImg] = await Promise.all([
  // loadImageSourceFromURL('assets/wabbit_alpha.png'),
  loadImageSourceFromURL('assets/OwlAlpha.png'),
]);

// Owl in its own scroll rect (shows just the eyes region)
const owlSprite = createDisplayContainer();
const owlBitmap = createBitmap();
owlBitmap.data.image = owlImg;
owlBitmap.data.smoothing = true;
addSceneChild(owlSprite, owlBitmap);
setDisplayObjectScrollRectangle(owlSprite, { x: 0, y: 300, width: 200, height: 250 });
owlSprite.x = 100;
owlSprite.y = 630;

// Text list
const textSprite = createDisplayContainer();
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
const textField = createRichText();
textField.data.defaultTextFormat = textFmt;
textField.data.width = pos(1280);
textField.data.height = pos(2000);
textField.data.multiline = true;
textField.data.wordWrap = false;
textField.data.text = movies.join('\n');
addSceneChild(textSprite, textField);
addSceneChild(textSprite, owlSprite);
textSprite.x = pos(300);
textSprite.y = pos(350);

const textRect = { x: 0, y: 0, width: 400, height: 300 };
setDisplayObjectScrollRectangle(textSprite, { ...textRect });

// Border around text area
const outerSprite = createDisplayContainer();
const borderColor = 0xe8c343;
function addBorderRect(x: number, y: number, w: number, h: number): void {
  const s = createShape();
  appendShapeBeginFill(s, borderColor);
  appendShapeRectangle(s, x, y, w, h);
  appendShapeEndFill(s);
  addSceneChild(outerSprite, s);
}
addBorderRect(textSprite.x - 2, textSprite.y - 2, textRect.width + 4, 2);
addBorderRect(textSprite.x - 2, textSprite.y - 2, 2, textRect.height + 4);
addBorderRect(textSprite.x + textRect.width, textSprite.y - 2, 2, textRect.height + 4);
addBorderRect(textSprite.x - 2, textSprite.y + textRect.height, textRect.width + 4, 2);
addSceneChild(outerSprite, textSprite);

const outerRect = { x: 0, y: 0, width: W, height: H };
setDisplayObjectScrollRectangle(outerSprite, { ...outerRect });
addSceneChild(root, outerSprite);

// Status label
const status = createRichText();
status.data.defaultTextFormat = textFmt;
status.x = 0;
status.y = 0;
status.data.width = pos(400);
status.data.height = pos(50);
status.data.text = 'scrollRect test';
addSceneChild(root, status);

let inc = pos(5);
let owlInc = pos(5);
let owlRectX = 0;
let textRectY = 0;
let outerAngle = 0;
const outerInc = (2 * Math.PI) / FRAMES_PER_ROTATION;

function enterFrame(): void {
  textRectY += inc;
  if (textRectY >= pos(550)) inc = -pos(5);
  else if (textRectY <= 0) inc = pos(5);
  setDisplayObjectScrollRectangle(textSprite, { x: 0, y: textRectY, width: textRect.width, height: textRect.height });

  owlRectX += owlInc;
  setDisplayObjectScrollRectangle(owlSprite, { x: owlRectX, y: 300, width: 200, height: 250 });

  outerAngle += outerInc;
  if (outerAngle > 2 * Math.PI) outerAngle -= 2 * Math.PI;
  outerRect.x = RADIUS + RADIUS * Math.cos(outerAngle);
  outerRect.y = RADIUS + RADIUS * Math.sin(outerAngle) + (720 - H) / 2;
  setDisplayObjectScrollRectangle(outerSprite, { ...outerRect });

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
