import { createDisplayObject } from '@flighthq/displayobject';
import {
  createCanvasRenderState,
  defaultCanvasDisplayObjectRenderer,
  renderCanvasDisplayObject,
} from '@flighthq/displayobject-canvas';
import { prepareDisplayObjectRender, registerRenderer } from '@flighthq/render';
import { DisplayObjectKind } from '@flighthq/types';

test('attach renderer to new canvas', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const renderState = createCanvasRenderState(canvas);

  const obj = createDisplayObject();

  registerRenderer(renderState, DisplayObjectKind, defaultCanvasDisplayObjectRenderer);
  prepareDisplayObjectRender(renderState, obj);
  renderCanvasDisplayObject(renderState, obj);
});
