import type { DOMRenderState } from '@flighthq/types';

export type DOMRenderStateInternal = Omit<DOMRenderState, 'element'> & {
  element: HTMLElement;
};
