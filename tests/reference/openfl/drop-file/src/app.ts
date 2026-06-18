import { createReferenceStage } from '../../_harness/stage';
// Tests file drop via HTML5 drag-and-drop. Drop a file onto the window to see its path/name.
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 600;

const { root } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

const instructions = new TextField();
instructions.defaultTextFormat = new TextFormat('sans-serif', 20, 0x333333);
instructions.x = 20;
instructions.y = 20;
instructions.width = WIDTH - 40;
instructions.height = 40;
instructions.text = 'Drop a file onto this window';
root.addChild(instructions);

const result = new TextField();
result.defaultTextFormat = new TextFormat('monospace', 16, 0x000000);
result.x = 20;
result.y = 80;
result.width = WIDTH - 40;
result.height = HEIGHT - 100;
result.multiline = true;
result.wordWrap = true;
root.addChild(result);

document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  result.text = Array.from(files)
    .map((f) => f.name)
    .join('\n');
});
