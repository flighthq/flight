import {
  addChild,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  createText,
  defaultCanvasTextRenderer,
  loadFontFromURL,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  TextKind,
  updateDisplayObjectBeforeRender,
} from '@flighthq/engine';

const dpr = window.devicePixelRatio || 1;
const canvas = createCanvasElement(400, 200, dpr);
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, TextKind, defaultCanvasTextRenderer);

const font = await loadFontFromURL('assets/KatamotzIkasi.woff', 'Katamotz Ikasi');

const root = createDisplayObject();
root.scaleX = dpr;
root.scaleY = dpr;

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
