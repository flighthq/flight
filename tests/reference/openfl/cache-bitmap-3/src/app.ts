// Requires: assets/wabbit_alpha.png
// Port of CacheBitmapTest3. Tests bitmap + rich text sliding with alpha animation.
import Bitmap from 'openfl/display/Bitmap';
import type BitmapData from 'openfl/display/BitmapData';
import Loader from 'openfl/display/Loader';
import Shape from 'openfl/display/Shape';
import Sprite from 'openfl/display/Sprite';
import Stage from 'openfl/display/Stage';
import Event from 'openfl/events/Event';
import URLRequest from 'openfl/net/URLRequest';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 600;

function pos(i: number): number {
  return (i * HEIGHT) / 720;
}

const stage = new Stage(WIDTH, HEIGHT, 0x000000);
document.getElementById('app')!.appendChild((stage as any).element);
const root = new Sprite();
stage.addChild(root);

const stageBg = new Shape();
stageBg.graphics.beginFill(0x000000);
stageBg.graphics.drawRect(0, 0, WIDTH, HEIGHT);
stageBg.graphics.endFill();
root.addChild(stageBg);

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
  const image = await loadBitmapData('assets/wabbit_alpha.png');
  const sc = HEIGHT / 720;

  const posters = new Sprite();

  const bmp1 = new Bitmap(image);
  bmp1.smoothing = true;
  bmp1.scaleX = sc;
  bmp1.scaleY = sc;
  posters.addChild(bmp1);

  const bmp2 = new Bitmap(image);
  bmp2.smoothing = true;
  bmp2.alpha = 0.5;
  bmp2.x = pos(125);
  bmp2.scaleX = sc;
  bmp2.scaleY = sc;
  posters.addChild(bmp2);

  const bmp3 = new Bitmap(image);
  bmp3.smoothing = true;
  bmp3.x = pos(250);
  bmp3.scaleX = sc;
  bmp3.scaleY = sc;
  posters.addChild(bmp3);

  root.addChild(posters);

  const menuGroup = new Sprite();

  const menuBg = new Shape();
  menuBg.graphics.beginFill(0xff22ff);
  menuBg.graphics.drawRect(pos(109), pos(186), pos(1171), pos(572));
  menuBg.graphics.endFill();
  menuGroup.addChild(menuBg);

  const title = new TextField();
  title.defaultTextFormat = new TextFormat('sans-serif', pos(44), 0xe8c343);
  title.x = pos(109);
  title.y = pos(186);
  title.width = pos(500);
  title.height = pos(60);
  title.text = 'My Collection';
  menuGroup.addChild(title);

  const menuItems = [
    'Lady and the Tramp',
    'The Adventures of Milo and Otis',
    'Mary Poppins',
    "Charlotte's Web",
    'The Secret World of Arrietty',
    'Babe',
    "It's a Wonderful Life",
    'Bringing Up Baby',
    'It Happened One Night',
  ];
  for (let i = 0; i < menuItems.length; i++) {
    const item = new TextField();
    item.defaultTextFormat = new TextFormat('sans-serif', pos(28), 0xffffff);
    item.x = pos(109);
    item.y = pos(291 + i * 44);
    item.width = pos(1000);
    item.height = pos(40);
    item.text = menuItems[i];
    menuGroup.addChild(item);
  }
  root.addChild(menuGroup);

  const statusLabel = new TextField();
  statusLabel.defaultTextFormat = new TextFormat('sans-serif', pos(28), 0xe8c343);
  statusLabel.x = 0;
  statusLabel.y = 0;
  statusLabel.width = pos(400);
  statusLabel.height = pos(40);
  statusLabel.text = 'cacheAsBitmap: n/a';
  root.addChild(statusLabel);

  let menuX = 0;
  let menuXInc = pos(5);
  const maxX = pos(640);

  root.addEventListener(Event.ENTER_FRAME, () => {
    menuX += menuXInc;
    if (menuX <= 0 || menuX >= maxX) menuXInc = -menuXInc;

    const alpha = (maxX - menuX) / maxX;
    posters.x = menuX;
    menuGroup.x = menuX;
    menuGroup.alpha = alpha;
    posters.alpha = alpha;
  });
})();
