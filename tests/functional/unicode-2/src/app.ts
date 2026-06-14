// Requires: assets/data.utf8, assets/unifont-8.0.01.ttf
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  createDisplayContainer,
  createRichText,
  createShape,
  loadFontFromURL,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const unifont = await loadFontFromURL('assets/unifont-8.0.01.ttf', 'Unifont');

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
addNodeChild(root, bg);

const fmt = { font: unifont.name, size: 18, color: 0x000000 };

const response = await fetch('assets/data.utf8');
const utf8str = await response.text();

const full = createRichText();
full.data.defaultTextFormat = fmt;
full.data.text = utf8str;
full.x = 50;
full.y = 50;
full.data.width = 300;
full.data.height = 50;
addNodeChild(root, full);

const lengthLabel = createRichText();
lengthLabel.data.defaultTextFormat = fmt;
lengthLabel.data.text = String(utf8str.length);
lengthLabel.x = 400;
lengthLabel.y = 50;
lengthLabel.data.width = 100;
lengthLabel.data.height = 30;
addNodeChild(root, lengthLabel);

for (let i = 0; i < utf8str.length; i++) {
  const tf = createRichText();
  tf.data.defaultTextFormat = fmt;
  tf.data.text = utf8str[i];
  tf.x = 450 + i * 30;
  tf.y = 50;
  tf.data.width = 30;
  tf.data.height = 30;
  addNodeChild(root, tf);
}

for (let i = 0; i < Math.floor(utf8str.length / 2); i++) {
  const tf = createRichText();
  tf.data.defaultTextFormat = fmt;
  tf.data.text = utf8str.slice(i * 2, i * 2 + 2);
  tf.x = 450 + i * 60;
  tf.y = 100;
  tf.data.width = 60;
  tf.data.height = 30;
  addNodeChild(root, tf);
}

render(root);
