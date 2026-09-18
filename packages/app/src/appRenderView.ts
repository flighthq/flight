import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type {
  AppRenderView,
  AppRenderViewResize,
  EntityRuntime,
  RenderState,
  RenderTargetDimensions,
  EntityConstruction,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { computeWindowDeviceTransform } from './appWindow';

interface AppRenderViewRuntime<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> extends EntityRuntime {
  attached: boolean;
  resize: AppRenderViewResize<State, Target>;
  synchronize: () => void;
}

// Starts window-driven synchronization for a view. Idempotent: attaching an already attached view first
// removes its existing signal connection, then synchronizes once and installs exactly one connection.
export function attachAppRenderView(view: AppRenderView): void {
  const runtime = getAppRenderViewRuntime(view);
  if (runtime.attached) disconnectSignal(view.window.onResize, runtime.synchronize);
  synchronizeAppRenderView(view);
  connectSignal(view.window.onResize, runtime.synchronize);
  runtime.attached = true;
}

export function createAppRenderView<State extends RenderState, Target extends RenderTargetDimensions>(
  window: AppRenderView<State, Target>['window'],
  renderState: State,
  renderTarget: Target,
  viewport: AppRenderView<State, Target>['viewport'],
  resize: AppRenderViewResize<State, Target>,
): AppRenderView<State, Target> {
  const view = allocateEntity<AppRenderView<State, Target>>();
  initializeAppRenderView(view, window, renderState, renderTarget, viewport, resize);
  return finishEntity(view);
}

// Stops window-driven synchronization. The linked window/state/target/viewport remain caller-owned and
// independently usable.
export function detachAppRenderView(view: AppRenderView): void {
  const runtime = getAppRenderViewRuntime(view);
  if (!runtime.attached) return;
  disconnectSignal(view.window.onResize, runtime.synchronize);
  runtime.attached = false;
}

// Links an existing window, command state, target, and viewport without taking ownership of any of
// them. The resize operation is the backend's allocation seam; it must be idempotent because
// synchronizeAppRenderView invokes it even when storage already has the requested extent.
export function initializeAppRenderView<State extends RenderState, Target extends RenderTargetDimensions>(
  view: EntityConstruction<AppRenderView<State, Target>>,
  window: AppRenderView<State, Target>['window'],
  renderState: State,
  renderTarget: Target,
  viewport: AppRenderView<State, Target>['viewport'],
  resize: AppRenderViewResize<State, Target>,
): void {
  view.renderState = renderState;
  view.renderTarget = renderTarget;
  view.viewport = viewport;
  view.window = window;
  const runtime = createEntityRuntime() as AppRenderViewRuntime<State, Target>;
  runtime.attached = false;
  runtime.resize = resize;
  runtime.synchronize = () => synchronizeAppRenderView(view);
  view[EntityRuntimeKey] = runtime;
  synchronizeAppRenderView(view);
}

// Reconciles one view from its window authority. Logical window dimensions become device-pixel target
// and viewport dimensions; the render state's pixel ratio and 2D device transform receive the same DPR.
export function synchronizeAppRenderView(view: AppRenderView): void {
  const devicePixelRatio = view.window.devicePixelRatio;
  const width = Math.max(0, Math.round(view.window.width * devicePixelRatio));
  const height = Math.max(0, Math.round(view.window.height * devicePixelRatio));
  const runtime = getAppRenderViewRuntime(view);

  runtime.resize(view.renderState, view.renderTarget, width, height);
  view.viewport.devicePixelRatio = devicePixelRatio;
  view.viewport.height = height;
  view.viewport.width = width;
  view.viewport.x = 0;
  view.viewport.y = 0;
  view.renderState.pixelRatio = devicePixelRatio;
  if (view.renderState.renderTransform2D !== null) {
    computeWindowDeviceTransform(view.window, view.renderState.renderTransform2D);
  }
}

function getAppRenderViewRuntime(view: AppRenderView): AppRenderViewRuntime<RenderState, RenderTargetDimensions> {
  return view[EntityRuntimeKey] as AppRenderViewRuntime<RenderState, RenderTargetDimensions>;
}
