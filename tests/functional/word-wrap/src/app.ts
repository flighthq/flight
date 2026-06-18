import {
  addNodeChild,
  createDisplayContainer,
  createRichText,
  invalidateNodeAppearance,
  RichTextKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  kinds: [RichTextKind],
});

const root = createDisplayContainer();

const W = width;
const H = height;

const field = createRichText();
field.data.defaultTextFormat = { font: 'sans-serif', size: 28, bold: true };
field.data.textColor = 0xe8c343;
field.data.multiline = true;
field.data.wordWrap = true;
field.data.border = true;
field.data.borderColor = 0xe8c343;
field.x = 100;
field.y = 100;
field.data.width = 300;
field.data.height = H - 200;
field.data.htmlText =
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
addNodeChild(root, field);

const maxWidth = W - field.x - 100;
let textWidth = 300;
let widthInc = 3;

function enterFrame(): void {
  textWidth += widthInc;
  if (textWidth <= 5 || textWidth >= maxWidth) widthInc = -widthInc;
  field.data.width = textWidth;
  invalidateNodeAppearance(field);

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
