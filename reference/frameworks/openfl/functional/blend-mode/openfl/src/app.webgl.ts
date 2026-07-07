import { createReferenceStage } from '../../../../harness/stage';
// Requires: assets/BlendSquare.png, assets/BlendCircle.png
// Port of BlendModeTest1.
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import BlendMode from 'openfl/display/BlendMode';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Event from 'openfl/events/Event';
import UrlRequest from 'openfl/net/URLRequest';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 1100;
const HEIGHT = 700;

const BLEND_MODES: [BlendMode, string][] = [
  [BlendMode.NORMAL, 'normal'],
  [BlendMode.LAYER, 'layer'],
  [BlendMode.MULTIPLY, 'multiply'],
  [BlendMode.SCREEN, 'screen'],
  [BlendMode.LIGHTEN, 'lighten'],
  [BlendMode.DARKEN, 'darken'],
  [BlendMode.DIFFERENCE, 'difference'],
  [BlendMode.ADD, 'add'],
  [BlendMode.SUBTRACT, 'subtract'],
  [BlendMode.INVERT, 'invert'],
  [BlendMode.ALPHA, 'alpha'],
  [BlendMode.ERASE, 'erase'],
  [BlendMode.OVERLAY, 'overlay'],
  [BlendMode.HARDLIGHT, 'hardlight'],
];

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

(async () => {
  const [squareBd, circleBd] = await Promise.all([
    loadBitmapData('assets/BlendSquare.png'),
    loadBitmapData('assets/BlendCircle.png'),
  ]);

  let rows = 1;
  while (rows * Math.floor((rows * 16) / 9) < BLEND_MODES.length) rows++;
  const cols = Math.floor((rows * 16) / 9);

  for (let i = 0; i < BLEND_MODES.length; i++) {
    const [mode, name] = BLEND_MODES[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = (WIDTH * col) / cols + WIDTH / (2 * cols);
    const cy = (HEIGHT * row) / rows + HEIGHT / (2 * rows) - 20;

    const square = new Bitmap(squareBd);
    square.smoothing = true;
    square.x = cx - squareBd.width / 2;
    square.y = cy - squareBd.height / 2;
    root.addChild(square);

    const circle = new Bitmap(circleBd);
    circle.smoothing = true;
    circle.x = cx - 10;
    circle.y = cy - 10;
    circle.blendMode = mode;
    root.addChild(circle);

    const lbl = new TextField();
    lbl.defaultTextFormat = new TextFormat('_sans', 14, 0x222222, true);
    lbl.x = cx - squareBd.width / 2 - 30;
    lbl.y = cy + squareBd.height / 2 + 40;
    lbl.width = 200;
    lbl.height = 30;
    lbl.text = name;
    root.addChild(lbl);
  }
})();
