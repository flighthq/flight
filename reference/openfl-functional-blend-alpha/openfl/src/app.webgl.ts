import Shape from 'openfl/display/Shape';

import { createReferenceStage } from '../../../_harness/stage';

const WIDTH = 800;
const HEIGHT = 600;

const { root } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

const ROWS = 9;
const cellW = WIDTH / 4;
const cellH = HEIGHT / ROWS;

for (let y = 0; y < ROWS; y++) {
  const alpha = 1 - y / 8;
  const frag = Math.round(alpha * 255);
  const solidColor = (frag << 16) | (frag << 8) | frag;

  // Column 0 — solid reference
  const ref = new Shape();
  ref.graphics.beginFill(solidColor);
  ref.graphics.drawRect(0, y * cellH, cellW, cellH);
  ref.graphics.endFill();
  root.addChild(ref);

  // Columns 1 & 2 — white base + semi-transparent black overlay
  for (const col of [1, 2]) {
    const base = new Shape();
    base.graphics.beginFill(0xffffff);
    base.graphics.drawRect(col * cellW, y * cellH, cellW, cellH);
    base.graphics.endFill();
    root.addChild(base);

    const overlay = new Shape();
    overlay.graphics.beginFill(0x000000, 1 - alpha);
    overlay.graphics.drawRect(col * cellW, y * cellH, cellW, cellH);
    overlay.graphics.endFill();
    root.addChild(overlay);
  }

  // Column 3 — white base + color with alpha baked into fill alpha parameter
  const base3 = new Shape();
  base3.graphics.beginFill(0xffffff);
  base3.graphics.drawRect(3 * cellW, y * cellH, cellW, cellH);
  base3.graphics.endFill();
  root.addChild(base3);

  const overlay3 = new Shape();
  overlay3.graphics.beginFill(solidColor, alpha);
  overlay3.graphics.drawRect(3 * cellW, y * cellH, cellW, cellH);
  overlay3.graphics.endFill();
  root.addChild(overlay3);
}
