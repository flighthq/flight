import Shape from 'openfl/display/Shape';
import Sprite from 'openfl/display/Sprite';
import Stage from 'openfl/display/Stage';
import Event from 'openfl/events/Event';

const WIDTH = 800;
const HEIGHT = 600;

// Multiply-with-carry PRNG seeded at startup so results are deterministic per session.
// Algorithm from https://en.wikipedia.org/wiki/Multiply-with-carry
const RESIDUES = 4096;
const PHI = 0x9e3779b9 | 0;
let _c = 362436;
let _rotation = RESIDUES - 1;
const _Q: number[] = [Date.now() & 0x7fff_ffff];
_Q.push((_Q[0] + PHI) | 0);
_Q.push((_Q[1] + PHI) | 0);
for (let i = 3; i < RESIDUES; i++) _Q.push((_Q[i - 3] ^ _Q[i - 2] ^ PHI ^ i) | 0);

function seededRandom(max: number): number {
  const a = 18782;
  const r = 0xffff_fffe;
  _rotation = (_rotation + 1) & (RESIDUES - 1);
  const t = Math.imul(a, _Q[_rotation]) + _c;
  _c = (t / 0x1_0000_0000) | 0;
  let x = (t + _c) | 0;
  if (x < _c) {
    x = (x + 1) | 0;
    _c++;
  }
  _Q[_rotation] = (r - x) | 0;
  return (((_Q[_rotation] % max) + max) % max) | 0;
}

function pos(i: number): number {
  return (i * HEIGHT) / 720;
}

const stage = new Stage(WIDTH, HEIGHT, 0x000000);
document.getElementById('app')!.appendChild((stage as any).element);
const root = new Sprite();
stage.addChild(root);

const bg = new Shape();
bg.graphics.beginFill(0x000000);
bg.graphics.drawRect(0, 0, WIDTH, HEIGHT);
bg.graphics.endFill();
root.addChild(bg);

const redSquare = new Shape();
redSquare.graphics.beginFill(0xff0000);
redSquare.graphics.drawRect(pos(148), pos(67), pos(370), pos(273));
redSquare.graphics.endFill();
root.addChild(redSquare);

const blueSquare = new Shape();
blueSquare.graphics.beginFill(0x0000ff);
blueSquare.graphics.drawRect(pos(281), pos(201), pos(501), pos(447));
blueSquare.graphics.endFill();
root.addChild(blueSquare);

const greenSquare = new Shape();
greenSquare.graphics.beginFill(0x00ff00);
greenSquare.graphics.drawRect(pos(420), pos(224), pos(182), pos(97));
greenSquare.graphics.endFill();
root.addChild(greenSquare);

const randomRect = new Shape();
root.addChild(randomRect);

root.addEventListener(Event.ENTER_FRAME, () => {
  const w = seededRandom(1279);
  const h = seededRandom(719);
  const x = seededRandom(1280 - w);
  const y = seededRandom(720 - h);
  const color = seededRandom(0x100_0000);

  randomRect.graphics.clear();
  randomRect.graphics.beginFill(color);
  randomRect.graphics.drawRect(pos(x), pos(y), pos(w), pos(h));
  randomRect.graphics.endFill();
});
