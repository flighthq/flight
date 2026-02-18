import { CanvasRenderer } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/stage';

test('attach renderer to new canvas', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  const renderer = new CanvasRenderer(canvas);

  const obj = createDisplayObject();
  obj.opaqueBackground = 0xff0000;

  CanvasRenderer.render(renderer, obj);
});
