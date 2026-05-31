import { createDisplayObject, createDOMRenderState, registerRenderer, renderDOMDisplayObject, updateDisplayObjectBeforeRender } from '@flighthq/sdk';
import { DisplayObjectKind } from '@flighthq/sdk';

test('sdk browser barrel can render a display object to the DOM', () => {
  const container = document.createElement('div');
  const state = createDOMRenderState(container);
  const obj = createDisplayObject();

  const renderer = {
    createData() {
      return null;
    },
    draw(state: { element: HTMLElement }, data: { source: unknown }) {
      const el = document.createElement('div');
      el.textContent = 'rendered';
      state.element.appendChild(el);
    },
  };

  registerRenderer(state, DisplayObjectKind, renderer as any);
  updateDisplayObjectBeforeRender(state, obj);
  renderDOMDisplayObject(state, obj);

  expect(container.firstChild).not.toBeNull();
  expect((container.firstChild as HTMLElement).textContent).toBe('rendered');
});
