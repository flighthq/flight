import {
  addNodeChild,
  createDisplayContainer,
  createRichText,
  enableTextInput,
  setTextInputSelection,
} from '@flighthq/sdk';

import { render } from './render';

const root = createDisplayContainer();

const field = createRichText({
  data: {
    border: true,
    borderColor: 0x3366cc,
    defaultTextFormat: { font: 'sans-serif', size: 30 },
    height: 60,
    selectable: true,
    text: 'Editable RichText selection',
    textColor: 0x222222,
    width: 640,
  },
});
field.x = 60;
field.y = 90;

// enableTextInput attaches the editable-input slot; the RichText renderer's opt-in overlay draws the
// selection highlight from it (keyed off the slot — a static RichText draws no overlay).
const input = enableTextInput(field);
input.focused = true;
addNodeChild(root, field);
setTextInputSelection(field, 9, 17); // highlight "RichText"

render(root);
