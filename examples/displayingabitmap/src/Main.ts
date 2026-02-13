import { Sprite } from '@flighthq/flight';
import { DisplayObjectDerivedState } from '@flighthq/types';

export default class Main extends Sprite {
  sprite = new Sprite();
  constructor() {
    super();

    // hack
    const localBounds = { x: 0, y: 0, width: 0, height: 0 };
    this.sprite[DisplayObjectDerivedState.Key].localBounds = localBounds;

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
