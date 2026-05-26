import type { DOMRenderState } from '@flighthq/types';

export function renderDOMBackground(state: DOMRenderState): void {
  if ((state.backgroundColor & 0xff) !== 0) {
    state.element.style.backgroundColor = state.backgroundColorString;
  } else {
    state.element.style.backgroundColor = '';
  }
}
