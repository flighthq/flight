// Requires: assets/OwlAlpha.png
// Port of ScrollRectTest1. Tests nested scrollRect clipping with animation.
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Sprite from 'openfl/display/Sprite';
import Stage from 'openfl/display/Stage';
import Event from 'openfl/events/Event';
import Rectangle from 'openfl/geom/Rectangle';
import URLRequest from 'openfl/net/URLRequest';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 1280;
const HEIGHT = 720;
const FRAMES_PER_ROTATION = 200;
const RADIUS = 120;

function pos(i: number): number {
  return (i * HEIGHT) / 720;
}

const stage = new Stage(WIDTH, HEIGHT, 0x000000);
document.getElementById('app')!.appendChild((stage as any).element);
const root = new Sprite();
stage.addChild(root);

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
  const owlBd = await loadBitmapData('assets/OwlAlpha.png');

  // Owl in its own scroll rect (shows just the eyes region)
  const owlSprite = new Sprite();
  const owlBitmap = new Bitmap(owlBd);
  owlBitmap.smoothing = true;
  owlSprite.addChild(owlBitmap);
  owlSprite.scrollRect = new Rectangle(0, 300, 200, 250);
  owlSprite.x = 100;
  owlSprite.y = 630;

  // Text list
  const textSprite = new Sprite();
  const textFmt = new TextFormat('sans-serif', 28, 0xe8c343);
  const movies = [
    'The Shawshank Redemption (1994)',
    'The Godfather (1972)',
    'The Godfather: Part II (1974)',
    'Pulp Fiction (1994)',
    'The Good, the Bad and the Ugly (1966)',
    'The Dark Knight (2008)',
    '12 Angry Men (1957)',
    "Schindler's List (1993)",
    'The Lord of the Rings: The Return of the King (2003)',
    'Fight Club (1999)',
    'Star Wars: Episode V - The Empire Strikes Back (1980)',
    'The Lord of the Rings: The Fellowship of the Ring (2001)',
    "One Flew Over the Cuckoo's Nest (1975)",
    'Goodfellas (1990)',
    'Seven Samurai (1954)',
    'Inception (2010)',
    'Star Wars: Episode IV - A New Hope (1977)',
    'Forrest Gump (1994)',
    'The Matrix (1999)',
    'The Lord of the Rings: The Two Towers (2002)',
  ];
  const textField = new TextField();
  textField.defaultTextFormat = textFmt;
  textField.width = pos(1280);
  textField.height = pos(2000);
  textField.multiline = true;
  textField.wordWrap = false;
  textField.text = movies.join('\n');
  textSprite.addChild(textField);
  textSprite.addChild(owlSprite);
  textSprite.x = pos(300);
  textSprite.y = pos(350);

  const textRectW = 400;
  const textRectH = 300;
  textSprite.scrollRect = new Rectangle(0, 0, textRectW, textRectH);

  // Border around text area
  const outerSprite = new Sprite();
  const borderColor = 0xe8c343;
  function addBorderRect(x: number, y: number, w: number, h: number): void {
    const s = new Shape();
    s.graphics.beginFill(borderColor);
    s.graphics.drawRect(x, y, w, h);
    s.graphics.endFill();
    outerSprite.addChild(s);
  }
  addBorderRect(textSprite.x - 2, textSprite.y - 2, textRectW + 4, 2);
  addBorderRect(textSprite.x - 2, textSprite.y - 2, 2, textRectH + 4);
  addBorderRect(textSprite.x + textRectW, textSprite.y - 2, 2, textRectH + 4);
  addBorderRect(textSprite.x - 2, textSprite.y + textRectH, textRectW + 4, 2);
  outerSprite.addChild(textSprite);

  outerSprite.scrollRect = new Rectangle(0, 0, WIDTH, HEIGHT);
  root.addChild(outerSprite);

  // Status label
  const status = new TextField();
  status.defaultTextFormat = textFmt;
  status.x = 0;
  status.y = 0;
  status.width = pos(400);
  status.height = pos(50);
  status.text = 'scrollRect test';
  root.addChild(status);

  let inc = pos(5);
  let owlInc = pos(5);
  let owlRectX = 0;
  let textRectY = 0;
  let outerAngle = 0;
  const outerInc = (2 * Math.PI) / FRAMES_PER_ROTATION;
  const outerRectX = { x: 0, y: 0 };

  root.addEventListener(Event.ENTER_FRAME, () => {
    textRectY += inc;
    if (textRectY >= pos(550)) inc = -pos(5);
    else if (textRectY <= 0) inc = pos(5);
    textSprite.scrollRect = new Rectangle(0, textRectY, textRectW, textRectH);

    owlRectX += owlInc;
    if (owlRectX >= owlBd.width || owlRectX <= 0) owlInc = -owlInc;
    owlSprite.scrollRect = new Rectangle(owlRectX, 300, 200, 250);

    outerAngle += outerInc;
    if (outerAngle > 2 * Math.PI) outerAngle -= 2 * Math.PI;
    outerRectX.x = RADIUS + RADIUS * Math.cos(outerAngle);
    outerRectX.y = RADIUS + RADIUS * Math.sin(outerAngle);
    outerSprite.scrollRect = new Rectangle(outerRectX.x, outerRectX.y, WIDTH, HEIGHT);
  });
})();
