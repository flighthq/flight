import { RenderableSymbols as R } from '@flighthq/contracts';
import type { Rectangle } from '@flighthq/math';
import { Sprite } from '@flighthq/scene';

export default class Main extends Sprite {
  sprite = new Sprite();
  constructor() {
    super();

    // hack
    const localBounds: Rectangle = this.sprite[R.localBounds];
    localBounds.width = 100;
    localBounds.height = 100;

    this.sprite.opaqueBackground = 0xff0000;

    // var loader = new Loader();
    // loader.contentLoaderInfo.addEventListener(Event.COMPLETE, this.loader_onComplete);
    // loader.load(new URLRequest('openfl.png'));
  }

  // // Event Handlers

  // private loader_onComplete = (event: Event) => {
  //   var bitmap = event.target.loader.content;
  //   bitmap.x = (this.stage.stageWidth - bitmap.width) / 2;
  //   bitmap.y = (this.stage.stageHeight - bitmap.height) / 2;
  //   this.addChild(bitmap);
  // };
}
