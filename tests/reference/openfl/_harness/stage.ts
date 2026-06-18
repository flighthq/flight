import Sprite from 'openfl/display/Sprite';
import Stage from 'openfl/display/Stage';

export interface ReferenceStage {
  stage: Stage;
  root: Sprite;
}

// Bootstraps the OpenFL window + Stage + root Sprite and mounts the canvas, separated from each
// sample's "Main" scene code the way a real OpenFL project splits its window/Stage from the Main
// Sprite. `allowHighDPI` mirrors <window allow-high-dpi="true"/> in project.xml — without it
// OpenFL's HTML5Window keeps scale=1 and never sizes the canvas backing by devicePixelRatio. See
// ./README.md.
export function createReferenceStage(width: number, height: number, color: number): ReferenceStage {
  const stage = new Stage(width, height, color, null, { allowHighDPI: true });
  document.getElementById('app')!.appendChild((stage as unknown as { element: HTMLElement }).element);
  const root = new Sprite();
  stage.addChild(root);
  return { stage, root };
}
