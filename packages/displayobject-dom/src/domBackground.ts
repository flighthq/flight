import type { DomRenderState } from '@flighthq/types';

export function renderDomBackground(state: DomRenderState): void {
  if ((state.backgroundColor & 0xff) !== 0) {
    state.element.style.backgroundColor = state.backgroundColorString;
  } else {
    state.element.style.backgroundColor = '';
  }
}
