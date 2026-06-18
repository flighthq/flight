import { createReferenceStage } from '../../_harness/stage';
// Requires: assets/wabbit_alpha.png
// Port of BlurTest1. Shows 3 bitmaps with blur filters at different quality levels.
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Event from 'openfl/events/Event';
import BlurFilter from 'openfl/filters/BlurFilter';
import URLRequest from 'openfl/net/URLRequest';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 400;

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

  const SCALE = 5;
  const bmpW = bd.width * SCALE;
  const bmpH = bd.height * SCALE;

  for (let i = 0; i < 3; i++) {
    const bmp = new Bitmap(bd);
    bmp.smoothing = true;
    bmp.scaleX = SCALE;
    bmp.scaleY = SCALE;
    bmp.x = 50 + i * (bmpW + 50);
    bmp.y = 50;
    const blurAmount = 4 * (i + 1);
    bmp.filters = [new BlurFilter(blurAmount, blurAmount, i + 1)];
    root.addChild(bmp);

    const lbl = new TextField();
    lbl.defaultTextFormat = new TextFormat('_sans', 14, 0x444444);
    lbl.x = bmp.x;
    lbl.y = bmp.y + bmpH + 8;
    lbl.width = bmpW;
    lbl.height = 24;
    lbl.text = `quality ${i + 1}`;
    root.addChild(lbl);
  }
})();
