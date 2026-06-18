import { createReferenceStage } from '../../_harness/stage';
// Requires: assets/wabbit_alpha.png
// Port of GlowTest. Shows 4 bitmaps with glow filter variants.
// Variants: normal, inner, knockout, inner+knockout
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Event from 'openfl/events/Event';
import GlowFilter from 'openfl/filters/GlowFilter';
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

const glowConfigs: { inner: boolean; knockout: boolean }[] = [
  { inner: false, knockout: false },
  { inner: true, knockout: false },
  { inner: false, knockout: true },
  { inner: true, knockout: true },
];
const labels = ['normal', 'inner', 'knockout', 'inner + knockout'];

(async () => {
  const bd = await loadBitmapData('assets/wabbit_alpha.png');

  for (let i = 0; i < 4; i++) {
    const bmp = new Bitmap(bd);
    bmp.smoothing = true;
    bmp.x = 50 + i * (bd.width + 50);
    bmp.y = 50;
    const { inner, knockout } = glowConfigs[i];
    bmp.filters = [new GlowFilter(0xff0000, 1, 8, 8, 2, 1, inner, knockout)];
    root.addChild(bmp);

    const lbl = new TextField();
    lbl.defaultTextFormat = new TextFormat('sans-serif', 14, 0x444444);
    lbl.x = bmp.x;
    lbl.y = bmp.y + bd.height + 8;
    lbl.width = bd.width + 40;
    lbl.height = 24;
    lbl.text = labels[i];
    root.addChild(lbl);
  }
})();
