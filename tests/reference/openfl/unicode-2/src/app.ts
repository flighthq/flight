import { createReferenceStage } from '../../_harness/stage';
// Requires: assets/unifont-8.0.01.ttf, assets/data.utf8
// Displays raw UTF-8 file content in a large text field.
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 1000;
const HEIGHT = 400;
const FONT = 'Unifont';

const { root } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

(async () => {
  const ff = new FontFace(FONT, 'url(assets/unifont-8.0.01.ttf)');
  await ff.load();
  (document.fonts as any).add(ff);

  const utf8str = await (await fetch('assets/data.utf8')).text();

  const field = new TextField();
  field.defaultTextFormat = new TextFormat(FONT, 16, 0x000000);
  field.x = 10;
  field.y = 10;
  field.width = WIDTH - 20;
  field.height = HEIGHT - 20;
  field.multiline = true;
  field.wordWrap = true;
  field.text = utf8str;
  root.addChild(field);
})();
