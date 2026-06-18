import { createReferenceStage } from '../../_harness/stage';
// Requires: assets/wabbit_alpha.png
// Port of ClipTest1. Tests scrollRect clipping on bitmaps and rich text.
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Event from 'openfl/events/Event';
import Rectangle from 'openfl/geom/Rectangle';
import URLRequest from 'openfl/net/URLRequest';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 600;

const { root } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

const bg = new Shape();
bg.graphics.beginFill(0xffffff);
bg.graphics.drawRect(0, 0, WIDTH, HEIGHT);
bg.graphics.endFill();
root.addChild(bg);

function loadBitmapData(url: string): Promise<BitmapData> {
  return new Promise<BitmapData>((resolve) => {
    const loader = new Loader();
    loader.contentLoaderInfo.addEventListener(Event.COMPLETE, () => {
      resolve((loader.content as Bitmap).bitmapData!);
    });
    loader.load(new URLRequest(url));
  });
}

(async () => {
  const bd = await loadBitmapData('assets/wabbit_alpha.png');
  const iw = bd.width;
  const ih = bd.height;

  // Ghost row (dim background at original positions)
  for (let i = 0; i < 4; i++) {
    const ghost = new Bitmap(bd);
    ghost.smoothing = true;
    ghost.x = i * (WIDTH / 4) + WIDTH / 8 - iw / 2;
    ghost.y = ih / 2;
    ghost.alpha = 0.3;
    root.addChild(ghost);
  }

  // Top row: 4 bitmaps with different scroll rect configurations
  for (let i = 0; i < 4; i++) {
    const bmp = new Bitmap(bd);
    bmp.smoothing = true;
    bmp.x = i * (WIDTH / 4) + WIDTH / 8 - iw / 2;
    bmp.y = ih / 2;
    root.addChild(bmp);

    if (i === 1) bmp.scrollRect = new Rectangle(0, 0, iw / 2, ih / 2);
    if (i === 2) bmp.scrollRect = new Rectangle(iw / 2, ih / 2, iw / 2, ih / 2);
    if (i === 3) bmp.scrollRect = new Rectangle(WIDTH * 2, HEIGHT * 2, WIDTH * 10, HEIGHT * 10);
  }

  // Bottom row: 4 text fields with different scroll rect configurations
  const textColors = [0xaa1100, 0x11aa00, 0x1100aa, 0x660066];
  const textValues = ['Text Field 1', 'Text Field 2', 'Text Field 3', 'Text Field 4'];
  for (let i = 0; i < 4; i++) {
    const tf = new TextField();
    tf.defaultTextFormat = new TextFormat('_sans', 32, textColors[i]);
    tf.x = i * (WIDTH / 4);
    tf.y = HEIGHT / 2 + HEIGHT / 4;
    tf.width = 400;
    tf.height = 400;
    tf.text = textValues[i];
    root.addChild(tf);

    if (i === 1) tf.scrollRect = new Rectangle(0, 0, 200, 200);
    if (i === 2) tf.scrollRect = new Rectangle(0, 40, 200, 20);
    if (i === 3) tf.scrollRect = new Rectangle(WIDTH * 2, HEIGHT * 2, WIDTH * 10, HEIGHT * 10);
  }
})();
