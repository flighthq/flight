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
  // OpenFL's HTML5Window styles its element 100%×100% and resizes the canvas to that element, so a
  // full-width / auto-height host stretches the canvas to the viewport while fixed-size content stays
  // WIDTH×HEIGHT and no longer fills (and flickers with the ResizeObserver). Pin the host to the
  // stage size so the canvas stays WIDTH×HEIGHT, matching the fixed Flight columns.
  const host = document.getElementById('app')!;
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.appendChild((stage as unknown as { element: HTMLElement }).element);
  const root = new Sprite();
  stage.addChild(root);
  return { stage, root };
}
