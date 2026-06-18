import Event from 'openfl/events/Event';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

import { createReferenceStage } from '../../_harness/stage';

const WIDTH = 800;
const HEIGHT = 600;

const { root } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

const sample =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud ' +
  'exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure ' +
  'dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. ' +
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt ' +
  'mollit anim id est laborum.';

const field = new TextField();
field.defaultTextFormat = new TextFormat('sans-serif', 18, 0x222222);
field.x = 40;
field.y = 80;
field.height = HEIGHT - 120;
field.multiline = true;
field.wordWrap = true;
field.border = true;
field.text = sample;
root.addChild(field);

const label = new TextField();
label.defaultTextFormat = new TextFormat('sans-serif', 14, 0x555555);
label.x = 40;
label.y = 40;
label.width = WIDTH - 80;
label.height = 30;
label.text = 'Width animating…';
root.addChild(label);

let t = 0;
const minW = 100;
const maxW = WIDTH - 80;

root.addEventListener(Event.ENTER_FRAME, () => {
  t += 0.02;
  const textWidth = minW + ((Math.sin(t) + 1) / 2) * (maxW - minW);
  field.width = textWidth;
  label.text = `width = ${Math.round(textWidth)}px`;
});
