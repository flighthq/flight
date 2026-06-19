import { createMatrix } from '@flighthq/geometry';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  setRenderStateBackgroundColor,
} from '@flighthq/render';
import type { DOMRenderOptions, DOMRenderState, DOMRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function createDOMRenderState(element: HTMLElement, options: Partial<DOMRenderOptions> = {}): DOMRenderState {
  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as DOMRenderState;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  state.domCSSFilterResolver = null;
  (state as { element: HTMLElement }).element = element;
  state.allowSmoothing = options.imageSmoothingEnabled ?? true;

  const runtime = createDOMRenderStateRuntime();
  state[EntityRuntimeKey] = runtime;
  runtime.currentBlendMode = null;
  runtime.domClipHooks = null;
  runtime.domClipStack = [];
  runtime.domCurrentElement = null;
  runtime.domElementMap = new WeakMap();
  runtime.domNextOrderList = [];
  runtime.domOrderLength = -1; // -1 = never rendered; forces first-call reconciliation
  runtime.domOrderList = [];

  element.style.position = 'relative';
  element.style.overflow = 'hidden';

  return state;
}

// Allocates the package-private DOM runtime for a DOMRenderState. createDOMRenderState attaches one to
// each state under EntityRuntimeKey and populates its fields; getDOMRenderStateRuntime reads it back.
// The render path writes the returned object every frame, so the return is intentionally mutable (not
// Readonly).
export function createDOMRenderStateRuntime(): DOMRenderStateRuntime {
  return createRenderStateRuntime() as DOMRenderStateRuntime;
}

// Resolves the package-private DOM runtime attached to a DOMRenderState. Mutable by design: the render
// path writes its fields every frame.
export function getDOMRenderStateRuntime(state: DOMRenderState): DOMRenderStateRuntime {
  return state[EntityRuntimeKey] as DOMRenderStateRuntime;
}
