import { createRenderState, renderDisplayObject, setDisplayObjectRenderer } from '@flighthq/render-canvas';
import { updateDisplayGraph } from '@flighthq/render-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';

test('attach renderer to new canvas', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const renderState = createRenderState(canvas);

  const obj = createDisplayObject();
  obj.opaqueBackground = 0xff0000;

  setDisplayObjectRenderer(renderState);
  updateDisplayGraph(renderState, obj);
  renderDisplayObject(renderState, obj);
});
