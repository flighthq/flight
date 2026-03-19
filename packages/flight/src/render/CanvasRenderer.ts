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

import type { DisplayObject } from '../scene/graph/display';
import type CanvasRenderOptions from './CanvasRenderOptions';

export default class CanvasRenderer {
  private state: CanvasRenderState;

  constructor(canvas: HTMLCanvasElement, options: CanvasRenderOptions) {
    let _options: CanvasRenderOptionsModel | undefined = undefined;
    if (options) {
      _options = {
        backgroundColor: options.backgroundColor,
        contextAttributes: options.contextAttributes,
        imageSmoothingEnabled: options.imageSmoothingEnabled,
        imageSmoothingQuality: options.imageSmoothingQuality,
        pixelRatio: options.pixelRatio,
        renderTransform: options.renderTransform ? options.renderTransform.model : undefined,
        roundPixels: options.roundPixels,
      };
    }
    this.state = createCanvasRenderState(canvas, _options);
    registerRenderer(this.state, DisplayObjectKind, defaultCanvasDisplayObjectRenderer);
    registerRenderer(this.state, BitmapKind, defaultCanvasBitmapRenderer);
  }

  render(object: DisplayObject): void {
    if (updateDisplayObjectBeforeRender(this.state, object.model)) {
      renderBackground(this.state);
      renderDisplayObject(this.state, object.model);
    }
  }
}
