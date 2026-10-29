import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityRaw } from '@flighthq/entity/contract';
import type { RenderState, RenderTargetDescriptor, RenderTargetDimensions, Viewport } from '@flighthq/types/contract';

// One drawable view over caller-owned render components. A view is deliberately windowless: the
// caller that owns a size authority supplies logical dimensions and device-pixel ratio to
// resizeRenderView. This permits headless views and multiple viewports over one target without an
// application-layer dependency.
export interface RenderView<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> extends EntityRaw {
  readonly renderState: State;
  readonly renderTarget: Target;
  readonly viewport: Viewport;
}

export type RenderViewResize<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> = (renderState: State, renderTarget: Target, width: number, height: number) => void;

// Width and height come from resizeRenderView. The remaining target storage axes stay
// caller-selected and are passed unchanged to a backend target allocator.
export type RenderViewTargetOptions = Omit<RenderTargetDescriptor, 'height' | 'width'>;

export function createRenderView<State extends RenderState, Target extends RenderTargetDimensions>(
  renderState: State,
  renderTarget: Target,
  viewport: RenderView<State, Target>['viewport'],
): RenderView<State, Target> {
  const view = allocateEntity<RenderView<State, Target>>();
  initializeRenderView(view, renderState, renderTarget, viewport);
  return finishEntity(view);
}

// Links an existing command state, target and viewport without taking ownership of any of them.
// Backend allocation remains explicit at each resize call and is not retained by the view.
export function initializeRenderView<State extends RenderState, Target extends RenderTargetDimensions>(
  view: EntityConstruction<RenderView<State, Target>>,
  renderState: State,
  renderTarget: Target,
  viewport: RenderView<State, Target>['viewport'],
): void {
  view.renderState = renderState;
  view.renderTarget = renderTarget;
  view.viewport = viewport;
}

// Reconciles one view from caller-supplied logical dimensions. The target and viewport receive
// device-pixel dimensions; the render state receives the same pixel ratio. The caller supplies the
// backend allocation seam for this operation, and it runs only when the target extent changes.
export function resizeRenderView<State extends RenderState, Target extends RenderTargetDimensions>(
  view: RenderView<State, Target>,
  logicalWidth: number,
  logicalHeight: number,
  devicePixelRatio: number,
  resize: RenderViewResize<State, Target>,
): void {
  const width = Math.max(0, Math.round(logicalWidth * devicePixelRatio));
  const height = Math.max(0, Math.round(logicalHeight * devicePixelRatio));
  if (view.renderTarget.width !== width || view.renderTarget.height !== height) {
    resize(view.renderState, view.renderTarget, width, height);
  }
  view.viewport.devicePixelRatio = devicePixelRatio;
  view.viewport.height = height;
  view.viewport.width = width;
  view.viewport.x = 0;
  view.viewport.y = 0;
  view.renderState.pixelRatio = devicePixelRatio;
}
