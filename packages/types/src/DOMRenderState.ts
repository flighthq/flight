import type { BlendMode } from './BlendMode';
import type { RenderState } from './RenderState';

export interface DOMRenderState extends RenderState {
  readonly element: HTMLElement;
  currentBlendMode: BlendMode | null;
}
