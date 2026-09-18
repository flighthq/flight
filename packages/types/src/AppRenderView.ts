import type { AppWindow } from './AppWindow';
import type { Entity } from './Entity';
import type { GlContextOptions } from './GlContext';
import type { GlPipeline } from './GlPipeline';
import type { GlRenderOptions } from './GlRenderOptions';
import type { GlRenderState } from './GlRenderState';
import type { GlTextureRenderTarget } from './GlRenderTarget';
import type { RenderState } from './RenderState';
import type { RenderTargetDescriptor, RenderTargetDimensions } from './RenderTarget';
import type { Viewport } from './Viewport';

// The explicit application-side assembly for one drawable view. The four components stay independently
// accessible: the window is the logical-size authority, the RenderState is the current command context,
// the RenderTarget owns storage, and the device-pixel Viewport selects the drawable rectangle.
export interface AppRenderView<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> extends Entity {
  readonly renderState: State;
  readonly renderTarget: Target;
  readonly viewport: Viewport;
  readonly window: AppWindow;
}

export type AppRenderViewResize<
  State extends RenderState = RenderState,
  Target extends RenderTargetDimensions = RenderTargetDimensions,
> = (renderState: State, renderTarget: Target, width: number, height: number) => void;

// Width and height are window-derived for an AppRenderView. The remaining target storage axes
// stay caller-selected and are passed unchanged to the backend target allocator.
export type AppRenderViewTargetOptions = Omit<RenderTargetDescriptor, 'height' | 'width'>;

export interface GlAppRenderViewOptions {
  readonly context?: Readonly<GlContextOptions>;
  readonly pipeline: Readonly<GlPipeline>;
  readonly render?: Readonly<GlRenderOptions>;
  readonly target?: Readonly<AppRenderViewTargetOptions>;
}

export type GlAppRenderView = AppRenderView<GlRenderState, GlTextureRenderTarget>;

// The render-layer half of a GL application view: the command state, its storage and the drawable
// rectangle a backend allocates for one acquired context. The application half — the window and the
// resize wiring that reconciles the two — stays in @flighthq/app, which a render backend may
// not import. A caller holding both composes them explicitly rather than through an assembly package.
export interface GlRenderViewResources extends Entity {
  readonly renderState: GlRenderState;
  readonly renderTarget: GlTextureRenderTarget;
  readonly viewport: Viewport;
}
