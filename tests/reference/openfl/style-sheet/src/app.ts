import Sprite from 'openfl/display/Sprite';
import Stage from 'openfl/display/Stage';
import StyleSheet from 'openfl/text/StyleSheet';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 600;

const stage = new Stage(WIDTH, HEIGHT, 0xffffff);
document.getElementById('app')!.appendChild((stage as any).element);
const root = new Sprite();
stage.addChild(root);

const ss = new StyleSheet();
ss.setStyle('body', { fontFamily: 'sans-serif', fontSize: '15', color: '#000066' });
ss.setStyle('h1', { fontFamily: 'sans-serif', fontSize: '32', color: '#000000', fontWeight: 'bold' });
ss.setStyle('h2', { fontFamily: 'sans-serif', fontSize: '19', color: '#000000' });
ss.setStyle('a:link', { color: '#0000cc', textDecoration: 'none' });
ss.setStyle('a:hover', { color: '#0000ff', textDecoration: 'underline' });
ss.setStyle('b', { fontWeight: 'bold' });
ss.setStyle('em', { fontWeight: 'bold' });
ss.setStyle('.typewriter', { fontFamily: 'monospace' });
ss.setStyle('redText', { color: '#ff0000' });

const field = new TextField();
field.multiline = true;
field.wordWrap = true;
field.border = true;
field.width = 500;
field.height = HEIGHT - 20;
field.defaultTextFormat = new TextFormat('sans-serif', 15, 0x000066);
field.styleSheet = ss;
field.htmlText =
  '<h1><b>HTML</b> Text <i>(sample <u>header</u>)</i></h1>' +
  'Here is some <em>sample</em> <strong>html text</strong> ' +
  "filling a text box <a href='http://openfl.org'>this link to openfl.org</a> and example headers" +
  '<br><br><h1>Header h1</h1><h2>Header h2</h2><br><br>Hello world<br><br>' +
  '<redText>This text <i>will be red</i></redText><br><br>' +
  "<h1><span class='typewriter'>typewriter</span></h1>";
root.addChild(field);
