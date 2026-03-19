import {
  createCanvasRenderState,
  defaultCanvasDisplayObjectRenderer,
  renderDisplayObject,
} from '@flighthq/render-canvas';
import { registerRenderer, updateDisplayObjectBeforeRender } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import { DisplayObjectKind } from '@flighthq/types';

test('attach renderer to new canvas', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const renderState = createCanvasRenderState(canvas);

  const obj = createDisplayObject();
  obj.opaqueBackground = 0xff0000;

  registerRenderer(renderState, DisplayObjectKind, defaultCanvasDisplayObjectRenderer);
  updateDisplayObjectBeforeRender(renderState, obj);
  renderDisplayObject(renderState, obj);
});
