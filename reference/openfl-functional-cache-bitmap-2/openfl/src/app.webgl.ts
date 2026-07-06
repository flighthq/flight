import { createReferenceStage } from '../../../_harness/stage';
// Port of CacheBitmapTest2. Tests nested alpha-blended containers orbiting.
import Shape from 'openfl/display/Shape';
import Sprite from 'openfl/display/Sprite';
import Event from 'openfl/events/Event';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 600;
const RPM = 20;
const COLORS = [
  0x3366ff, 0x6633ff, 0xcc33ff, 0xff33cc, 0x33ccff, 0x003df5, 0x002eb8, 0xff3366, 0x33ffcc, 0xb88a00, 0xf5b800,
  0xff6633, 0x33ff66, 0x66ff33, 0xccff33, 0xffcc33,
];

function pos(i: number): number {
  return (i * HEIGHT) / 720;
}

function makeChild(rects: { color: number; x: number; y: number }[]): Sprite {
  const c = new Sprite();
  const bg = new Shape();
  bg.graphics.beginFill(0xff0000);
  for (const { x, y } of rects.slice(0, 1)) {
    bg.graphics.drawRect(x, y, pos(125), pos(125));
  }
  bg.graphics.endFill();
  c.addChild(bg);
  for (const { color, x, y } of rects.slice(1)) {
    const s = new Shape();
    s.graphics.beginFill(color);
    s.graphics.drawRect(x, y, pos(100), pos(100));
    s.graphics.endFill();
    c.addChild(s);
  }
  return c;
}

const { root } = createReferenceStage(WIDTH, HEIGHT, 0x000000);

const stageBg = new Shape();
stageBg.graphics.beginFill(0x000000);
stageBg.graphics.drawRect(0, 0, WIDTH, HEIGHT);
stageBg.graphics.endFill();
root.addChild(stageBg);

const child1 = makeChild([
  { color: 0xff0000, x: pos(75), y: pos(25) },
  { color: COLORS[0], x: 0, y: 0 },
  { color: COLORS[1], x: pos(125), y: pos(10) },
  { color: COLORS[2], x: pos(125), y: pos(110) },
  { color: COLORS[3], x: 0, y: pos(110) },
]);

const child2 = makeChild([
  { color: 0xff0000, x: pos(415), y: pos(25) },
  { color: COLORS[4], x: pos(340), y: 0 },
  { color: COLORS[5], x: pos(465), y: pos(10) },
  { color: COLORS[6], x: pos(465), y: pos(110) },
  { color: COLORS[7], x: pos(340), y: pos(110) },
]);
child2.x = pos(150);

const parent = new Sprite();

const parentBg = new Shape();
parentBg.graphics.beginFill(0xff0000);
parentBg.graphics.drawRect(0, 0, pos(640), pos(480));
parentBg.graphics.endFill();
parent.addChild(parentBg);

const parentRects = [
  { color: COLORS[8], x: pos(207), y: pos(300) },
  { color: COLORS[9], x: pos(332), y: pos(310) },
  { color: COLORS[10], x: pos(332), y: pos(410) },
  { color: COLORS[11], x: pos(207), y: pos(410) },
];
for (const { color, x, y } of parentRects) {
  const s = new Shape();
  s.graphics.beginFill(color);
  s.graphics.drawRect(x, y, pos(100), pos(100));
  s.graphics.endFill();
  parent.addChild(s);
}

parent.addChild(child1);
parent.addChild(child2);
root.addChild(parent);

const status = new TextField();
status.defaultTextFormat = new TextFormat('_sans', pos(32), 0xffffff);
status.x = pos(10);
status.y = pos(10);
status.width = pos(1270);
status.height = pos(40);
status.text = 'render cache: OFF';
root.addChild(status);

const cx = pos(320);
const cy = pos(120);
const radius = pos(120);
let angle = 0;
let lastTime = performance.now();
let cacheEnabled = false;
let lastToggle = performance.now();
const TOGGLE_MS = 3000;

root.addEventListener(Event.ENTER_FRAME, () => {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  angle += (dt / (60 / RPM)) * Math.PI * 2;
  parent.x = cx + radius * Math.cos(angle);
  parent.y = cy + radius * Math.sin(angle);

  if (now - lastToggle >= TOGGLE_MS) {
    lastToggle = now;
    cacheEnabled = !cacheEnabled;
    parent.cacheAsBitmap = cacheEnabled;
    status.text = `render cache: ${cacheEnabled ? 'ON' : 'OFF'}`;
  }
});
