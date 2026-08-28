import type { ApplicationWindow } from './ApplicationWindow';
import type { Entity } from './Entity';
import type { GlContextOptions } from './GlContext';
import type { GlRenderOptions } from './GlRenderOptions';
import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget } from './GlRenderTarget';
import type { RenderState } from './RenderState';
import type { RenderTargetDescriptor, RenderTargetDimensions } from './RenderTarget';
import type { Viewport } from './Viewport';

// The explicit application-side assembly for one drawable view. The four components stay independently
// accessible: the window is the logical-size authority, the RenderState is the current command context,
// the RenderTarget owns storage, and the device-pixel Viewport selects the drawable rectangle.
export interface ApplicationRenderView<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> extends Entity {
  readonly renderState: State;
  readonly renderTarget: Target;
  readonly viewport: Viewport;
  readonly window: ApplicationWindow;
}

export type ApplicationRenderViewResize<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> = (renderState: State, renderTarget: Target, width: number, height: number) => void;

// Width and height are window-derived for an ApplicationRenderView. The remaining target storage axes
// stay caller-selected and are passed unchanged to the backend target allocator.
export type ApplicationRenderViewTargetOptions = Omit<RenderTargetDescriptor, 'height' | 'width'>;

export interface GlApplicationRenderViewOptions {
  readonly context?: Readonly<GlContextOptions>;
  readonly render?: Readonly<GlRenderOptions>;
  readonly target?: Readonly<ApplicationRenderViewTargetOptions>;
}

export type GlApplicationRenderView = ApplicationRenderView<GlRenderState, GlRenderTarget>;
