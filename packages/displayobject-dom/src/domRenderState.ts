import { createMatrix } from '@flighthq/geometry';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  setRenderStateBackgroundColor,
} from '@flighthq/render';
import type { DomRenderOptions, DomRenderState, DomRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

export function createDomRenderState(element: HTMLElement, options: Partial<DomRenderOptions> = {}): DomRenderState {
  const state = _createRenderState({
    pixelRatio: options.pixelRatio ?? 1,
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as DomRenderState;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  state.domCssFilterResolver = null;
  (state as { element: HTMLElement }).element = element;
  state.allowSmoothing = options.imageSmoothingEnabled ?? true;

  const runtime = createDomRenderStateRuntime();
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

// Allocates the package-private DOM runtime for a DomRenderState. createDomRenderState attaches one to
// each state under EntityRuntimeKey and populates its fields; getDomRenderStateRuntime reads it back.
// The render path writes the returned object every frame, so the return is intentionally mutable (not
// Readonly).
export function createDomRenderStateRuntime(): DomRenderStateRuntime {
  return createRenderStateRuntime() as DomRenderStateRuntime;
}

// Resolves the package-private DOM runtime attached to a DomRenderState. Mutable by design: the render
// path writes its fields every frame.
export function getDomRenderStateRuntime(state: DomRenderState): DomRenderStateRuntime {
  return state[EntityRuntimeKey] as DomRenderStateRuntime;
}
