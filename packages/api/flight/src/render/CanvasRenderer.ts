import {
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  defaultCanvasDisplayObjectRenderer,
  renderBackground,
  renderDisplayObject,
} from '@flighthq/render-canvas';
import { registerRenderer, updateDisplayObjectBeforeRender } from '@flighthq/render-core';
import {
  BitmapKind,
  type CanvasRenderOptions as CanvasRenderOptionsModel,
  type CanvasRenderState,
  DisplayObjectKind,
} from '@flighthq/types';

import type DisplayObject from '../scene/graph/display/DisplayObject';
import type CanvasRenderOptions from './CanvasRenderOptions';

export default class CanvasRenderer {
  private state: CanvasRenderState;

  constructor(canvas: HTMLCanvasElement, options?: Partial<CanvasRenderOptions>) {
    this.state = createCanvasRenderState(canvas, this.mapCanvasOptions(options));
    registerRenderer(this.state, DisplayObjectKind, defaultCanvasDisplayObjectRenderer);
    registerRenderer(this.state, BitmapKind, defaultCanvasBitmapRenderer);
  }

  private mapCanvasOptions(options?: Partial<CanvasRenderOptions>): CanvasRenderOptionsModel | undefined {
    if (!options) return undefined;
    return {
      ...options,
      renderTransform: options.renderTransform?.raw,
    };
  }

  render(object: DisplayObject): void {
    if (updateDisplayObjectBeforeRender(this.state, object.raw)) {
      renderBackground(this.state);
      renderDisplayObject(this.state, object.raw);
    }
  }
}
