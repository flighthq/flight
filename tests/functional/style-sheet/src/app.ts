import { addSceneChild, createDisplayContainer, createRichText } from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const field = createRichText();
field.data.multiline = true;
field.data.wordWrap = true;
field.data.border = true;
field.data.width = 500;
field.data.defaultTextFormat = { font: 'sans-serif', size: 15, color: 0x000066 };
field.data.styleSheet = {
  body: { font: 'sans-serif', size: 15, color: 0x000066 },
  h1: { font: 'sans-serif', size: 32, color: 0x000000, bold: true },
  h2: { font: 'sans-serif', size: 19, color: 0x000000 },
  'a:link': { color: 0x0000cc, underline: false },
  'a:hover': { color: 0x0000ff, underline: true },
  b: { bold: true },
  em: { bold: true },
  '.typewriter': { font: 'monospace' },
  redText: { color: 0xff0000 },
};
field.data.htmlText =
  '<h1><b>HTML</b> Text <i>(sample <u>header</u>)</i></h1>' +
  'Here is some <em>sample</em> <strong>html text</strong> ' +
  "filling a text box <a href='http://openfl.org'>this link to openfl.org</a> and example headers" +
  '<br><br><h1>Header h1</h1><h2>Header h2</h2><br><br>Hello world<br><br>' +
  '<redText>This text <i>will be red</i></redText><br><br>' +
  "<h1><span class='typewriter'>typewriter</span></h1>";
addSceneChild(root, field);

render(root);
