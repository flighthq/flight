import { createReferenceStage } from '../../../../harness/stage';
// Port of CacheBitmapTest1. Tests alpha-blended rounded-rect shapes orbiting the screen.
import Shape from 'openfl/display/Shape';
import Sprite from 'openfl/display/Sprite';
import Event from 'openfl/events/Event';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 600;
const RPM = 5;
const COLORS = [0xff4cf0, 0xfff372, 0x85ff75, 0x59ddff];

function pos(i: number): number {
  return (i * HEIGHT) / 720;
}

const { root } = createReferenceStage(WIDTH, HEIGHT, 0x000000);

const W = WIDTH;
const H = HEIGHT;

const stageBg = new Shape();
stageBg.graphics.beginFill(0x000000);
stageBg.graphics.drawRect(0, 0, W, H);
stageBg.graphics.endFill();
root.addChild(stageBg);

const bgRects: { color: number; alpha: number; x: number; y: number }[] = [
  { color: 0x002288, alpha: 1.0, x: pos(500), y: pos(200) },
  { color: 0x002288, alpha: 0.5, x: pos(700), y: pos(200) },
  { color: 0x002288, alpha: 0.1, x: pos(500), y: pos(400) },
];
for (const { color, alpha, x, y } of bgRects) {
  const s = new Shape();
  s.graphics.beginFill(color, alpha);
  s.graphics.drawRect(x, y, pos(200), pos(200));
  s.graphics.endFill();
  root.addChild(s);
}

const group = new Sprite();
root.addChild(group);

const redBase = new Shape();
redBase.graphics.beginFill(0xff0000);
redBase.graphics.drawRect(pos(75), pos(25), pos(125), pos(125));
redBase.graphics.endFill();
group.addChild(redBase);

const roundedRects = [
  { color: COLORS[0], x: 0, y: 0, rx: pos(100), ry: pos(100) },
  { color: COLORS[1], x: pos(125), y: pos(10), rx: pos(20), ry: pos(40) },
  { color: COLORS[2], x: pos(125), y: pos(110), rx: pos(40), ry: pos(20) },
  { color: COLORS[3], x: 0, y: pos(110), rx: pos(40), ry: pos(40) },
];
for (const { color, x, y, rx, ry } of roundedRects) {
  const s = new Shape();
  s.alpha = 0.66;
  s.graphics.beginFill(color);
  s.graphics.drawRoundRect(x, y, pos(100), pos(100), rx * 2, ry * 2);
  s.graphics.endFill();
  group.addChild(s);
}

const status = new TextField();
status.defaultTextFormat = new TextFormat('_sans', pos(32), 0xffffff);
status.x = pos(410);
status.y = pos(10);
status.width = pos(860);
status.height = pos(40);
status.text = 'render cache: OFF';
root.addChild(status);

const cx = pos(527);
const cy = pos(255);
const radius = pos(200);
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
  group.x = cx + radius * Math.cos(angle);
  group.y = cy + radius * Math.sin(angle);

  if (now - lastToggle >= TOGGLE_MS) {
    lastToggle = now;
    cacheEnabled = !cacheEnabled;
    group.cacheAsBitmap = cacheEnabled;
    status.text = `render cache: ${cacheEnabled ? 'ON' : 'OFF'}`;
  }
});
