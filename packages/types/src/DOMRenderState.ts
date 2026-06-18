import type { BlendMode } from './BlendMode';
import type { RenderProxy2D } from './RenderProxy2D';
import type { RenderState } from './RenderState';

export interface DOMRenderState extends RenderState {
  applyBlendMode: ((element: HTMLElement, blendMode: BlendMode | null) => void) | null;
  // Optional CSS-filter resolver. Installed by enableDOMCSSFilterSupport; null (and tree-shaken)
  // until then, keeping the binding lookup and its module out of filter-free bundles.
  domCSSFilterResolver: ((renderProxy: RenderProxy2D) => string | undefined) | null;
  readonly element: HTMLElement;
  currentBlendMode: BlendMode | null;
}
