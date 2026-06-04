import { registerRenderer } from '@flighthq/render';
import { updateDisplayObject } from '@flighthq/render';
import {
  createCanvasRenderState,
  defaultCanvasDisplayObjectRenderer,
  renderCanvasDisplayObject,
} from '@flighthq/render-canvas';
import { createDisplayObject } from '@flighthq/scene-display';
import { DisplayObjectKind } from '@flighthq/types';

test('attach renderer to new canvas', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const renderState = createCanvasRenderState(canvas);

  const obj = createDisplayObject();

  registerRenderer(renderState, DisplayObjectKind, defaultCanvasDisplayObjectRenderer);
  updateDisplayObjectBeforeRender(renderState, obj);
  renderCanvasDisplayObject(renderState, obj);
});
