import { Sprite } from '@flighthq/flight';
import { bounds } from '@flighthq/stage';

export default class Main extends Sprite {
  sprite = new Sprite();
  constructor() {
    super();

    // hack
    const localBounds = bounds.getLocalBoundsRect(this.sprite);
    (localBounds as any).width = 100; // eslint-disable-line
    (localBounds as any).height = 100; // eslint-disable-line

    this.sprite.opaqueBackground = 0xff0000;
    this.addChild(this.sprite);

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
