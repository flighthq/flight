// Tests file drop via HTML5 drag-and-drop. Drop a file onto the window to see its path/name.
import { addNodeChild, createDisplayContainer, createRichText } from '@flighthq/sdk';

import { height, render, width } from './render';

const root = createDisplayContainer();

const W = width;
const H = height;

const instructions = createRichText();
instructions.data.defaultTextFormat = { font: 'sans-serif', size: 20, color: 0x333333 };
instructions.x = 20;
instructions.y = 20;
instructions.data.width = W - 40;
instructions.data.height = 40;
instructions.data.text = 'Drop a file onto this window';
addNodeChild(root, instructions);

const result = createRichText();
result.data.defaultTextFormat = { font: 'monospace', size: 16, color: 0x000000 };
result.x = 20;
result.y = 80;
result.data.width = W - 40;
result.data.height = H - 100;
result.data.multiline = true;
result.data.wordWrap = true;
addNodeChild(root, result);

render(root);

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  const names = Array.from(files)
    .map((f) => f.name)
    .join('\n');
  result.data.text = names;
  render(root);
});
