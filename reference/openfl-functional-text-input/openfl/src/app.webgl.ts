// Reference for the Flight text-input functional test: an editable field with a live selection
// highlight. OpenFL's TextField in INPUT mode is the platform analog of the Flight RichText input
// slot, and setSelection drives the same selection-highlight overlay the Flight renderer draws from
// its enabled text-input slot.
import TextField from 'openfl/text/TextField';
import TextFieldType from 'openfl/text/TextFieldType';
import TextFormat from 'openfl/text/TextFormat';

import { createReferenceStage } from '../../../_harness/stage';

const WIDTH = 800;
const HEIGHT = 600;

const { root, stage } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

const field = new TextField();
field.type = TextFieldType.INPUT;
field.selectable = true;
field.border = true;
field.borderColor = 0x3366cc;
field.defaultTextFormat = new TextFormat('sans-serif', 30, 0x222222);
field.width = 640;
field.height = 60;
field.x = 60;
field.y = 90;
field.text = 'Editable RichText selection';
root.addChild(field);

// Focus the field and select "RichText" (indices 9–17) so the highlight matches the Flight scene.
stage.focus = field;
field.setSelection(9, 17);
