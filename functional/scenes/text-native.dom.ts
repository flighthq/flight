import type { DisplayObject } from '@flighthq/sdk';
import {
  NativeTextKind,
  addNodeChild,
  createDisplayContainer,
  createDomRenderState,
  createNativeText,
  defaultDomNativeTextRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
} from '@flighthq/sdk';
import { registerFunctionalTarget } from '@ft/verify';

// NativeText is platform/DOM-backed, so this test runs on the DOM backend only — there is no canvas or
// webgl render.*.ts, which restricts discovery to DOM.
const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.appendChild(container);

export const state = createDomRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, NativeTextKind, defaultDomNativeTextRenderer);
export const scale = 1;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}

registerFunctionalTarget({ kind: 'dom', state, width, height, scale, render });

const root = createDisplayContainer();

// autoSize 'left': the field box tracks the measured element size (bounds come from the renderer's
// measurement writeback, keeping displayobject DOM-free).
const heading = createNativeText({
  data: {
    autoSize: 'left',
    style: { bold: true, color: 0x1a1a1a, font: 'sans-serif', size: 32 },
    text: 'NativeText — platform/DOM text',
  },
});
heading.x = 60;
heading.y = 56;
addNodeChild(root, heading);

// autoSize 'none': a fixed wrapping box at the user width/height.
const paragraph = createNativeText({
  data: {
    autoSize: 'none',
    height: 180,
    style: { color: 0x333333, font: 'serif', leading: 6, size: 20 },
    text:
      'The platform text engine owns layout, measurement, and rendering. On web that is a DOM ' +
      'element; on a native port it would be CoreText or DirectWrite. NativeText opts out of the ' +
      'Flight TextLayout spine entirely — it is a sibling of TextLabel and RichText, not an extension.',
    width: width - 120,
  },
});
paragraph.x = 60;
paragraph.y = 130;
addNodeChild(root, paragraph);

const styled = createNativeText({
  data: {
    autoSize: 'left',
    style: { align: 'right', color: 0xc0392b, italic: true, size: 24 },
    text: 'italic, colored, right-aligned style',
  },
});
styled.x = 60;
styled.y = 340;
addNodeChild(root, styled);

render(root);
