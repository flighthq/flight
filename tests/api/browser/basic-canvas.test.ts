import { createCanvasRenderState, render } from '@flighthq/render-canvas';
import { createDisplayObject } from '@flighthq/scene-graph-stage';

test('attach renderer to new canvas', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const renderState = createCanvasRenderState(canvas);

  const obj = createDisplayObject();
  obj.opaqueBackground = 0xff0000;

  render(renderState, obj);
});
