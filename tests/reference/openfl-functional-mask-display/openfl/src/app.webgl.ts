import { createReferenceStage } from '../../../_harness/stage';
// Requires: assets/wabbit_alpha.png
// Port of MaskTest1. Tests display object masking with various offset configurations.
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Event from 'openfl/events/Event';
import URLRequest from 'openfl/net/URLRequest';

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

  // 4 masked bitmaps in a 2x2 grid.
  // Ghost bitmaps show the unmasked position at 30% opacity.
  const maskOffsets = [
    { dx: 0, dy: 0 },
    { dx: -10, dy: -10 },
    { dx: iw / 4, dy: ih / 4 },
    { dx: WIDTH * 10, dy: HEIGHT * 10 },
  ];

  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = col * (WIDTH / 3) + WIDTH / 6 - iw / 2;
    const cy = row === 0 ? ih / 2 : HEIGHT / 2 + ih / 2;

    // Ghost at bitmap position
    const ghost = new Bitmap(bd);
    ghost.smoothing = true;
    ghost.alpha = 0.3;
    ghost.x = cx;
    ghost.y = cy;
    root.addChild(ghost);

    // Ghost at mask position
    const ghostMask = new Bitmap(bd);
    ghostMask.smoothing = true;
    ghostMask.alpha = 0.3;
    ghostMask.x = cx + maskOffsets[i].dx;
    ghostMask.y = cy + maskOffsets[i].dy;
    root.addChild(ghostMask);

    // Bitmap
    const bmp = new Bitmap(bd);
    bmp.smoothing = true;
    bmp.x = cx;
    bmp.y = cy;
    root.addChild(bmp);

    // Mask bitmap (must be on the display list for openfl masks to work)
    const maskBmp = new Bitmap(bd);
    maskBmp.smoothing = true;
    maskBmp.x = cx + maskOffsets[i].dx;
    maskBmp.y = cy + maskOffsets[i].dy;
    root.addChild(maskBmp);

    bmp.mask = maskBmp;
  }
})();
