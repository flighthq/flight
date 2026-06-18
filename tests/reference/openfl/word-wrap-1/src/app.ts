import Event from 'openfl/events/Event';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

import { createReferenceStage } from '../../_harness/stage';

const WIDTH = 800;
const HEIGHT = 600;

const { root } = createReferenceStage(WIDTH, HEIGHT, 0xffffff);

const field = new TextField();
field.defaultTextFormat = new TextFormat('_sans', 28, 0xe8c343, true);
field.x = 100;
field.y = 100;
field.width = 300;
field.height = HEIGHT - 200;
field.multiline = true;
field.wordWrap = true;
field.border = true;
field.borderColor = 0xe8c343;
field.htmlText =
  'Here is some text: angelo <i>Ephesi ecclesiae</i> scribe haec dicit qui tenet septem ' +
  '<b>stellas</b> in dextera sua qui ambulat in medio septem ' +
  'candelabrorum aureorum scio <u>opera tua et laborem</u> et ' +
  '<br>&lt; (less than), &gt; (greater than), &amp; ' +
  '(ampersand), &quot; (double quote), ' +
  '&lt;&gt;&amp;&quot; (all) ' +
  'patientiam <font size="+10">tuam et quia</font> non potes ' +
  '<font size="-6" color="#123456">sustinere malos</font> et ' +
  'temptasti eos qui se dicunt apostolos et non sunt et ' +
  'invenisti eos mendaces et patientiam habes et sustinuisti ' +
  'propter nomen meum et non defecisti sed habeo adversus te <p></p>' +
  'quod caritatem tuam primam reliquisti memor esto itaque ' +
  'unde excideris et age paenitentiam et prima opera fac sin ' +
  'autem venio tibi et movebo candelabrum tuum de loco suo nisi ' +
  'paenitentiam egeris.';
root.addChild(field);

const maxWidth = WIDTH - field.x - 100;
let textWidth = 300;
let widthInc = 3;

root.addEventListener(Event.ENTER_FRAME, () => {
  textWidth += widthInc;
  if (textWidth <= 5 || textWidth >= maxWidth) widthInc = -widthInc;
  field.width = textWidth;
});
