import {
  addNodeChild,
  createDisplayContainer,
  createRichText,
  invalidateNodeAppearance,
  RichTextKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

const W = width;
const H = height;

const sample =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure ' +
  'dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ' +
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt ' +
  'mollit anim id est laborum.';

const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: 18, color: 0x222222 };
field.x = 40;
field.y = 80;
field.data.height = H - 120;
field.data.multiline = true;
field.data.wordWrap = true;
field.data.border = true;
field.data.text = sample;
addNodeChild(root, field);

const label = createRichText();
label.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x555555 };
label.x = 40;
label.y = 40;
label.data.width = W - 80;
label.data.height = 30;
label.data.text = 'Width animating…';
addNodeChild(root, label);

const minW = 100;
const maxW = W - 80;
let t = 0;

function enterFrame(): void {
  t += 0.02;
  const textWidth = minW + ((Math.sin(t) + 1) / 2) * (maxW - minW);
  field.data.width = textWidth;
  label.data.text = `width = ${Math.round(textWidth)}px`;
  invalidateNodeAppearance(field);
  invalidateNodeAppearance(label);

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
