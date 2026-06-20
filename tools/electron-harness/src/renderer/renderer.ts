import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeRectangle,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  createShape,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  invalidateNodeLocalTransform,
  prepareDisplayObjectRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  ShapeKind,
} from '@flighthq/sdk';

import type { FlightHarnessApi } from '../preload';

declare global {
  interface Window {
    flightHarness: FlightHarnessApi;
  }
}

// ── Flight scene (the renderer is a normal browser context, so it uses the web canvas renderer) ──
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(1024, 560, pixelRatio);
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, { backgroundColor: 0x1d1f23ff });
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

const root = createDisplayObject();
root.scaleX = pixelRatio;
root.scaleY = pixelRatio;

const card = createShape();
appendShapeBeginFill(card, 0x24afc4ff);
appendShapeRectangle(card, 0, 0, 320, 200);
card.x = 60;
card.y = 60;
invalidateNodeLocalTransform(card);
addNodeChild(root, card);

const dot = createShape();
appendShapeBeginFill(dot, 0xffcc33ff);
appendShapeCircle(dot, 0, 0, 56);
dot.x = 460;
dot.y = 160;
invalidateNodeLocalTransform(dot);
addNodeChild(root, dot);

if (prepareDisplayObjectRender(state, root)) {
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}

// ── OS-capability buttons (routed to the main process via the preload bridge) ──
const logElement = document.getElementById('log') as HTMLElement;
function log(message: string): void {
  logElement.textContent = `${message}\n${logElement.textContent ?? ''}`;
}

document.getElementById('open')?.addEventListener('click', async () => {
  const files = await window.flightHarness.openFileDialog();
  log(`openFile → ${files.length > 0 ? files.join(', ') : '(cancelled)'}`);
});

document.getElementById('read')?.addEventListener('click', async () => {
  log(`clipboard → ${JSON.stringify(await window.flightHarness.readClipboard())}`);
});

document.getElementById('write')?.addEventListener('click', async () => {
  await window.flightHarness.writeClipboard(`Written at ${performance.now().toFixed(0)}ms`);
  log('clipboard ← written');
});

document.getElementById('notify')?.addEventListener('click', async () => {
  await window.flightHarness.notify('Hello from the renderer');
  log('notification requested');
});
