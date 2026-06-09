import type { BlendMode } from './BlendMode';
import type { RenderState } from './RenderState';

export interface DOMRenderState extends RenderState {
  applyBlendMode: ((element: HTMLElement, blendMode: BlendMode | null) => void) | null;
  readonly element: HTMLElement;
  currentBlendMode: BlendMode | null;
}
