import { createCanvasRendererState, renderCanvas } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/stage';

test('attach renderer to new canvas', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const renderState = createCanvasRendererState(canvas);

  const obj = createDisplayObject();
  obj.opaqueBackground = 0xff0000;

  renderCanvas(renderState, obj);
});
