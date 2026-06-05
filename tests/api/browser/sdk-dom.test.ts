import type { DOMRenderState } from '@flighthq/sdk';
import {
  createDisplayObject,
  createDOMRenderState,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDOMDisplayObject,
  setDOMRendererElement,
} from '@flighthq/sdk';
import { DisplayObjectKind } from '@flighthq/sdk';

test('sdk browser barrel can render a display object to the DOM', () => {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  const obj = createDisplayObject();

  const el = document.createElement('div');
  el.textContent = 'rendered';

  const renderer = {
    createData() {
      return null;
    },
    draw(s: DOMRenderState) {
      setDOMRendererElement(s, el);
    },
  };

  registerRenderer(state, DisplayObjectKind, renderer as any);
  prepareDisplayObjectRender(state, obj);
  renderDOMDisplayObject(state, obj);

  expect(container.firstChild).not.toBeNull();
  expect((container.firstChild as HTMLElement).textContent).toBe('rendered');
});
