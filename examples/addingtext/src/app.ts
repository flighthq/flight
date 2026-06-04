import { addSceneChild, createDisplayObject, createText, loadFontFromURL } from '@flighthq/sdk';

import { render, scale } from './render';

const font = await loadFontFromURL('assets/KatamotzIkasi.woff', 'Katamotz Ikasi');

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const textField = createText();
textField.data.text = 'Hello World';
textField.data.textFormat = { font: font.name, size: 30, color: 0x7a0026 };
textField.x = 50;
textField.y = 50;
addSceneChild(root, textField);

function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
