import type { DomRenderState } from '@flighthq/sdk';
import {
  createDisplayObject,
  createDomRenderState,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDomDisplayObject,
  setDomRendererElement,
} from '@flighthq/sdk';
import { DisplayObjectKind } from '@flighthq/sdk';

test('sdk browser barrel can render a display object to the DOM', () => {
  const container = document.createElement('div');
  const state = createDomRenderState(container);
  const obj = createDisplayObject();

  const el = document.createElement('div');
  el.textContent = 'rendered';

  const renderer = {
    createData() {
      return null;
    },
    submit(s: DomRenderState) {
      setDomRendererElement(s, el);
    },
  };

  registerRenderer(state, DisplayObjectKind, renderer as any);
  prepareDisplayObjectRender(state, obj);
  renderDomDisplayObject(state, obj);

  expect(container.firstChild).not.toBeNull();
  expect((container.firstChild as HTMLElement).textContent).toBe('rendered');
});
