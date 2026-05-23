import {
  addChild,
  createCanvasRenderState,
  createDisplayObject,
  createText,
  defaultCanvasTextRenderer,
  loadFontSourceFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  TextKind,
  updateDisplayObjectBeforeRender,
} from '@flighthq/engine';

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 200;
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, TextKind, defaultCanvasTextRenderer);

const font = await loadFontSourceFromURL('assets/KatamotzIkasi.woff', 'Katamotz Ikasi');

const root = createDisplayObject();

const textField = createText();
textField.data.text = 'Hello World';
textField.data.textFormat = { font: font.name, size: 30, color: 0x7a0026 };
textField.x = 50;
textField.y = 50;
addChild(root, textField);

function enterFrame(): void {
  if (updateDisplayObjectBeforeRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, root);
  }
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
