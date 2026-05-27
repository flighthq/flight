import {
  addChild,
  createDisplayObject,
  createText,
  loadFontFromURL,
  updateDisplayObjectBeforeRender,
} from '@flighthq/engine';

import { render, scale, state } from './render';

const font = await loadFontFromURL('assets/KatamotzIkasi.woff', 'Katamotz Ikasi');

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const textField = createText();
textField.data.text = 'Hello World';
textField.data.textFormat = { font: font.name, size: 30, color: 0x7a0026 };
textField.x = 50;
textField.y = 50;
addChild(root, textField);

function enterFrame(): void {
  if (updateDisplayObjectBeforeRender(state, root)) {
    render(root);
  }
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
