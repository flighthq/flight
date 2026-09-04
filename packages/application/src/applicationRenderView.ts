import { allocateEntity, createEntityRuntime, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, disconnectSignal } from '@flighthq/signals/contract';
import type {
  ApplicationRenderView,
  ApplicationRenderViewResize,
  EntityConstruction,
  EntityRuntime,
  RenderState,
  RenderTargetDimensions,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { computeWindowDeviceTransform } from './window';

interface ApplicationRenderViewRuntime<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> extends EntityRuntime {
  attached: boolean;
  resize: ApplicationRenderViewResize<State, Target>;
  synchronize: () => void;
}

// Starts window-driven synchronization for a view. Idempotent: attaching an already attached view first
// removes its existing signal connection, then synchronizes once and installs exactly one connection.
export function attachApplicationRenderView(view: ApplicationRenderView): void {
  const runtime = getApplicationRenderViewRuntime(view);
  if (runtime.attached) disconnectSignal(view.window.onResize, runtime.synchronize);
  synchronizeApplicationRenderView(view);
  connectSignal(view.window.onResize, runtime.synchronize);
  runtime.attached = true;
}

// Links an existing window, command state, target, and viewport without taking ownership of any of
// them. The resize operation is the backend's allocation seam; it must be idempotent because
// synchronizeApplicationRenderView invokes it even when storage already has the requested extent.
export function createApplicationRenderView<State extends RenderState, Target extends RenderTargetDimensions>(
  window: ApplicationRenderView<State, Target>['window'],
  renderState: State,
  renderTarget: Target,
  viewport: ApplicationRenderView<State, Target>['viewport'],
  resize: ApplicationRenderViewResize<State, Target>,
): ApplicationRenderView<State, Target> {
  const view = allocateEntity<ApplicationRenderView<State, Target>>();
  view.renderState = renderState;
  view.renderTarget = renderTarget;
  view.viewport = viewport;
  view.window = window;
  const runtime = createEntityRuntime() as ApplicationRenderViewRuntime<State, Target>;
  runtime.attached = false;
  runtime.resize = resize;
  runtime.synchronize = () => synchronizeApplicationRenderView(view);
  view[EntityRuntimeKey] = runtime;
  synchronizeApplicationRenderView(view);
  return view;
}

// Stops window-driven synchronization. The linked window/state/target/viewport remain caller-owned and
// independently usable.
export function detachApplicationRenderView(view: ApplicationRenderView): void {
  const runtime = getApplicationRenderViewRuntime(view);
  if (!runtime.attached) return;
  disconnectSignal(view.window.onResize, runtime.synchronize);
  runtime.attached = false;
}

// Reconciles one view from its window authority. Logical window dimensions become device-pixel target
// and viewport dimensions; the render state's pixel ratio and 2D device transform receive the same DPR.
export function synchronizeApplicationRenderView(view: ApplicationRenderView): void {
  const devicePixelRatio = view.window.devicePixelRatio;
  const width = Math.max(0, Math.round(view.window.width * devicePixelRatio));
  const height = Math.max(0, Math.round(view.window.height * devicePixelRatio));
  const runtime = getApplicationRenderViewRuntime(view);

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

function getApplicationRenderViewRuntime(
  view: ApplicationRenderView,
): ApplicationRenderViewRuntime<RenderState, RenderTargetDimensions> {
  return view[EntityRuntimeKey] as ApplicationRenderViewRuntime<RenderState, RenderTargetDimensions>;
}
