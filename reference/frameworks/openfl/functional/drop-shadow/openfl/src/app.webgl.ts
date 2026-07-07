import { createReferenceStage } from '../../../../harness/stage';
// Requires: assets/wabbit_alpha.png
// Port of DropShadowTest. Shows 6 bitmaps with drop shadow filter variants.
// Variants: normal, inner, knockout, inner+knockout, hideObject, inner+hideObject
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Event from 'openfl/events/Event';
import DropShadowFilter from 'openfl/filters/DropShadowFilter';
import UrlRequest from 'openfl/net/URLRequest';
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
    loader.load(new UrlRequest(url));
  });
}

const shadowConfigs: { inner: boolean; knockout: boolean; hideObject: boolean }[] = [
  { inner: false, knockout: false, hideObject: false },
  { inner: true, knockout: false, hideObject: false },
  { inner: false, knockout: true, hideObject: false },
  { inner: true, knockout: true, hideObject: false },
  { inner: false, knockout: false, hideObject: true },
  { inner: true, knockout: false, hideObject: true },
];
const labels = ['normal', 'inner', 'knockout', 'inner + knockout', 'hideObject', 'inner + hideObject'];

(async () => {
  const bd = await loadBitmapData('assets/wabbit_alpha.png');

  const SCALE = 3;
  const bmpW = bd.width * SCALE;
  const bmpH = bd.height * SCALE;

  for (let i = 0; i < 6; i++) {
    const bmp = new Bitmap(bd);
    bmp.smoothing = true;
    bmp.scaleX = SCALE;
    bmp.scaleY = SCALE;
    bmp.x = 50 + i * (bmpW + 50);
    bmp.y = 50;
    const { inner, knockout, hideObject } = shadowConfigs[i];
    bmp.filters = [new DropShadowFilter(4, 45, 0x000000, 0.8, 8, 8, 1, 1, inner, knockout, hideObject)];
    root.addChild(bmp);

    const lbl = new TextField();
    lbl.defaultTextFormat = new TextFormat('_sans', 12, 0x444444);
    lbl.x = bmp.x;
    lbl.y = bmp.y + bmpH + 8;
    lbl.width = bmpW + 60;
    lbl.height = 24;
    lbl.text = labels[i];
    root.addChild(lbl);
  }
})();
