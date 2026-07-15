import type { KeyboardEventData, RichText, TextInputState } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  clearShapeCommands,
  connectSignal,
  createApplication,
  createDisplayObject,
  createRichText,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  startApplicationLoop,
} from '@flighthq/sdk';
import {
  enableTextInput,
  getTextInputCaretIndex,
  getTextInputDisplayText,
  getTextInputSelectionBeginIndex,
  getTextInputSelectionEndIndex,
  getTextInputState,
  handleTextInputKeyboard,
  insertTextInput,
  undoTextInput,
  redoTextInput,
} from '@flighthq/textinput';

import { canvas, render, scale } from './render';

const FIELD_WIDTH = 340;
const FIELD_HEIGHT = 28;
const FIELD_X = 30;
const LABEL_X = 30;
const FIELD_GAP = 70;
const START_Y = 40;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Three editable text fields: normal, numeric-only, and password.
const normalField = createRichText();
const numericField = createRichText();
const passwordField = createRichText();
const fields = [normalField, numericField, passwordField];
const fieldNames = ['Normal', 'Numeric Only', 'Password'];

function configureField(field: RichText, y: number, placeholder: string): void {
  field.x = FIELD_X;
  field.y = y;
  field.data.width = FIELD_WIDTH;
  field.data.height = FIELD_HEIGHT;
  field.data.multiline = false;
  field.data.wordWrap = false;
  field.data.selectable = true;
  field.data.background = true;
  field.data.backgroundColor = 0xffffff;
  field.data.border = true;
  field.data.borderColor = 0x999999;
  field.data.text = placeholder;
  field.data.defaultTextFormat = { font: 'sans-serif', size: 16, color: 0x222222 };
}

configureField(normalField, START_Y + 22, 'Type here...');
configureField(numericField, START_Y + FIELD_GAP + 22, '');
configureField(passwordField, START_Y + FIELD_GAP * 2 + 22, '');

// Enable text input on each field with appropriate options.
enableTextInput(normalField);
enableTextInput(numericField, { restrict: '0-9' });
enableTextInput(passwordField, { displayAsPassword: true });

// Labels above each field.
function createFieldLabel(text: string, y: number): ReturnType<typeof createTextLabel> {
  const label = createTextLabel();
  label.x = LABEL_X;
  label.y = y;
  label.data.text = text;
  label.data.textFormat = { font: 'sans-serif', size: 14, color: 0x444444 };
  invalidateNodeLocalTransform(label);
  return label;
}

const normalLabel = createFieldLabel('Normal Text Field', START_Y);
const numericLabel = createFieldLabel('Numeric Only (digits 0-9)', START_Y + FIELD_GAP);
const passwordLabel = createFieldLabel('Password Field', START_Y + FIELD_GAP * 2);

// Focus highlight shape (drawn behind the focused field as a colored border).
const focusHighlight = createShape();

// HUD text for displaying state information.
const hudText = createTextLabel();
hudText.x = 30;
hudText.y = START_Y + FIELD_GAP * 3 + 10;
hudText.data.textFormat = { font: 'monospace', size: 13, color: 0x333333 };
invalidateNodeLocalTransform(hudText);

// Instructions label.
const instructionsText = createTextLabel();
instructionsText.x = 30;
instructionsText.y = START_Y + FIELD_GAP * 3 + 110;
instructionsText.data.textFormat = { font: 'sans-serif', size: 12, color: 0x666666 };
instructionsText.data.text =
  'Click a field to focus. Type to enter text.\n' +
  'Arrow keys: move caret | Shift+Arrow: select\n' +
  'Ctrl+A: select all | Ctrl+Z: undo | Ctrl+Y: redo\n' +
  'Backspace/Delete: delete | Ctrl+Backspace: delete word';
invalidateNodeLocalTransform(instructionsText);

// Scene graph assembly.
addNodeChild(root, focusHighlight);
addNodeChild(root, normalLabel);
addNodeChild(root, normalField);
addNodeChild(root, numericLabel);
addNodeChild(root, numericField);
addNodeChild(root, passwordLabel);
addNodeChild(root, passwordField);
addNodeChild(root, hudText);
addNodeChild(root, instructionsText);

// Focus tracking -- which field is currently focused.
let focusedField: RichText | null = null;

function focusField(field: RichText): void {
  if (focusedField === field) return;
  // Blur previous.
  if (focusedField !== null) {
    const prevState = getTextInputState(focusedField);
    if (prevState !== null) prevState.focused = false;
    invalidateNodeAppearance(focusedField);
  }
  focusedField = field;
  const state = getTextInputState(field);
  if (state !== null) state.focused = true;
  invalidateNodeAppearance(field);
  updateFocusHighlight();
}

function blurAll(): void {
  if (focusedField !== null) {
    const state = getTextInputState(focusedField);
    if (state !== null) state.focused = false;
    invalidateNodeAppearance(focusedField);
  }
  focusedField = null;
  updateFocusHighlight();
}

function updateFocusHighlight(): void {
  clearShapeCommands(focusHighlight);
  if (focusedField === null) return;
  const pad = 3;
  appendShapeBeginFill(focusHighlight, 0x3399ff, 0.3);
  appendShapeRectangle(
    focusHighlight,
    focusedField.x - pad,
    focusedField.y - pad,
    FIELD_WIDTH + pad * 2,
    FIELD_HEIGHT + pad * 2,
  );
  invalidateNodeAppearance(focusHighlight);
}

// Click-to-focus: detect which field was clicked based on bounds.
window.addEventListener('pointerdown', (e: PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  let hit = false;
  for (const field of fields) {
    if (x >= field.x && x <= field.x + FIELD_WIDTH && y >= field.y && y <= field.y + FIELD_HEIGHT) {
      focusField(field);
      hit = true;
      break;
    }
  }
  if (!hit) blurAll();
});

// Keyboard handling: convert DOM KeyboardEvent to KeyboardEventData for handleTextInputKeyboard.
function toKeyboardEventData(e: KeyboardEvent): KeyboardEventData {
  return {
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    key: e.key,
    keyCode: e.keyCode,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
  };
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (focusedField === null) return;

  // Ctrl+Z: undo, Ctrl+Y: redo (handle before the generic keyboard handler since
  // handleTextInputKeyboard does not map these commands).
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) {
        redoTextInput(focusedField);
      } else {
        undoTextInput(focusedField);
      }
      return;
    }
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      redoTextInput(focusedField);
      return;
    }
  }

  const data = toKeyboardEventData(e);
  const handled = handleTextInputKeyboard(focusedField, data);
  if (handled) {
    e.preventDefault();
    return;
  }

  // Insert printable characters that handleTextInputKeyboard did not consume.
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    insertTextInput(focusedField, e.key);
  }
});

// Prevent default on Tab to avoid losing canvas focus.
window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    if (focusedField !== null) {
      const currentIndex = fields.indexOf(focusedField);
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + fields.length) % fields.length
        : (currentIndex + 1) % fields.length;
      focusField(fields[nextIndex]);
    } else {
      focusField(fields[0]);
    }
  }
});

function getFieldName(field: RichText | null): string {
  if (field === null) return 'None';
  const index = fields.indexOf(field);
  return index >= 0 ? fieldNames[index] : 'Unknown';
}

function updateHud(): void {
  let text = 'Focus: ' + getFieldName(focusedField);

  if (focusedField !== null) {
    const inputState: TextInputState | null = getTextInputState(focusedField);
    const caretIndex = getTextInputCaretIndex(focusedField);
    const selBegin = getTextInputSelectionBeginIndex(focusedField);
    const selEnd = getTextInputSelectionEndIndex(focusedField);
    const displayText = getTextInputDisplayText(focusedField);
    const rawText = focusedField.data.text;

    text += '\nCaret: ' + caretIndex;
    text += '\nSelection: ' + selBegin + ' - ' + selEnd;
    if (selBegin !== selEnd) {
      text += ' (' + (selEnd - selBegin) + ' chars)';
    }
    text += '\nChars: ' + rawText.length;
    text += '\nDisplay: "' + displayText + '"';
    if (inputState !== null && inputState.restrict.length > 0) {
      text += '\nRestrict: ' + inputState.restrict;
    }
    if (inputState !== null && inputState.displayAsPassword) {
      text += '\nPassword mode: on';
    }
  }

  hudText.data.text = text;
  invalidateNodeAppearance(hudText);
}

// Focus the first field on startup.
focusField(normalField);

// Render loop.
const app = createApplication();
connectSignal(app.onRender, () => {
  updateHud();
  render(root);
});
startApplicationLoop(app);
