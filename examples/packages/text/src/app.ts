import type { DisplayObject } from '@flighthq/sdk';
import { addNodeChild, createDisplayObject, createRichText, createTextLabel } from '@flighthq/sdk';

import { render, scale } from './render';

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Section 1: TextLabel basics — different sizes, colors, and font families.

const headingBasics = createTextLabel();
headingBasics.x = 30;
headingBasics.y = 20;
headingBasics.data.text = 'TextLabel Basics';
headingBasics.data.textFormat = { font: 'sans-serif', size: 18, bold: true, color: 0x222222 };
addNodeChild(root, headingBasics);

const labelSansSerif = createTextLabel();
labelSansSerif.x = 30;
labelSansSerif.y = 48;
labelSansSerif.data.text = 'Sans-serif 16px';
labelSansSerif.data.textFormat = { font: 'sans-serif', size: 16, color: 0x333333 };
addNodeChild(root, labelSansSerif);

const labelSerif = createTextLabel();
labelSerif.x = 200;
labelSerif.y = 48;
labelSerif.data.text = 'Serif 16px';
labelSerif.data.textFormat = { font: 'serif', size: 16, color: 0x333333 };
addNodeChild(root, labelSerif);

const labelMono = createTextLabel();
labelMono.x = 340;
labelMono.y = 48;
labelMono.data.text = 'Monospace 16px';
labelMono.data.textFormat = { font: 'monospace', size: 16, color: 0x333333 };
addNodeChild(root, labelMono);

const labelLarge = createTextLabel();
labelLarge.x = 540;
labelLarge.y = 40;
labelLarge.data.text = 'Large 28px';
labelLarge.data.textFormat = { font: 'sans-serif', size: 28, color: 0x1a6b3c };
addNodeChild(root, labelLarge);

const labelSmall = createTextLabel();
labelSmall.x = 30;
labelSmall.y = 74;
labelSmall.data.text = 'Small 12px in a different color';
labelSmall.data.textFormat = { font: 'sans-serif', size: 12, color: 0x7a0026 };
addNodeChild(root, labelSmall);

// Section 2: Text alignment — left, center, right aligned text labels.

const headingAlignment = createTextLabel();
headingAlignment.x = 30;
headingAlignment.y = 110;
headingAlignment.data.text = 'Text Alignment';
headingAlignment.data.textFormat = { font: 'sans-serif', size: 18, bold: true, color: 0x222222 };
addNodeChild(root, headingAlignment);

const alignLeft = createRichText();
alignLeft.x = 30;
alignLeft.y = 138;
alignLeft.data.width = 220;
alignLeft.data.height = 24;
alignLeft.data.text = 'Left aligned (default)';
alignLeft.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444, align: 'left' };
alignLeft.data.border = true;
alignLeft.data.borderColor = 0xcccccc;
addNodeChild(root, alignLeft);

const alignCenter = createRichText();
alignCenter.x = 270;
alignCenter.y = 138;
alignCenter.data.width = 220;
alignCenter.data.height = 24;
alignCenter.data.text = 'Center aligned';
alignCenter.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444, align: 'center' };
alignCenter.data.border = true;
alignCenter.data.borderColor = 0xcccccc;
addNodeChild(root, alignCenter);

const alignRight = createRichText();
alignRight.x = 510;
alignRight.y = 138;
alignRight.data.width = 220;
alignRight.data.height = 24;
alignRight.data.text = 'Right aligned';
alignRight.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444, align: 'right' };
alignRight.data.border = true;
alignRight.data.borderColor = 0xcccccc;
addNodeChild(root, alignRight);

// Section 3: RichText with word wrapping — a paragraph of text.

const headingWrapping = createTextLabel();
headingWrapping.x = 30;
headingWrapping.y = 185;
headingWrapping.data.text = 'Word Wrapping';
headingWrapping.data.textFormat = { font: 'sans-serif', size: 18, bold: true, color: 0x222222 };
addNodeChild(root, headingWrapping);

const wrappedText = createRichText();
wrappedText.x = 30;
wrappedText.y = 213;
wrappedText.data.width = 350;
wrappedText.data.wordWrap = true;
wrappedText.data.multiline = true;
wrappedText.data.text =
  'Flight is a tree-shakable graphics and application SDK. ' +
  'It spans a scene graph, four interchangeable renderers, ' +
  'offscreen image processing, and a full application layer. ' +
  'This paragraph demonstrates word wrapping within a fixed width.';
wrappedText.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x444444, leading: 4 };
addNodeChild(root, wrappedText);

const wrappedSerif = createRichText();
wrappedSerif.x = 410;
wrappedSerif.y = 213;
wrappedSerif.data.width = 320;
wrappedSerif.data.wordWrap = true;
wrappedSerif.data.multiline = true;
wrappedSerif.data.text =
  'The same paragraph rendered in serif at a slightly larger size. ' +
  'Each renderable node type is identified by a Kind string, and ' +
  'concrete renderers are registered explicitly by the caller.';
wrappedSerif.data.defaultTextFormat = { font: 'serif', size: 15, color: 0x555555, leading: 4 };
addNodeChild(root, wrappedSerif);

// Section 4: Styled text — bold, italic, underline via textFormat properties.

const headingStyles = createTextLabel();
headingStyles.x = 30;
headingStyles.y = 345;
headingStyles.data.text = 'Text Styles';
headingStyles.data.textFormat = { font: 'sans-serif', size: 18, bold: true, color: 0x222222 };
addNodeChild(root, headingStyles);

const styleBold = createTextLabel();
styleBold.x = 30;
styleBold.y = 373;
styleBold.data.text = 'Bold text';
styleBold.data.textFormat = { font: 'sans-serif', size: 16, bold: true, color: 0x333333 };
addNodeChild(root, styleBold);

const styleItalic = createTextLabel();
styleItalic.x = 160;
styleItalic.y = 373;
styleItalic.data.text = 'Italic text';
styleItalic.data.textFormat = { font: 'sans-serif', size: 16, italic: true, color: 0x333333 };
addNodeChild(root, styleItalic);

const styleBoldItalic = createTextLabel();
styleBoldItalic.x = 300;
styleBoldItalic.y = 373;
styleBoldItalic.data.text = 'Bold + Italic';
styleBoldItalic.data.textFormat = { font: 'sans-serif', size: 16, bold: true, italic: true, color: 0x333333 };
addNodeChild(root, styleBoldItalic);

const styleUnderline = createTextLabel();
styleUnderline.x = 470;
styleUnderline.y = 373;
styleUnderline.data.text = 'Underlined text';
styleUnderline.data.textFormat = { font: 'sans-serif', size: 16, underline: true, color: 0x2255aa };
addNodeChild(root, styleUnderline);

const styleLetterSpacing = createTextLabel();
styleLetterSpacing.x = 30;
styleLetterSpacing.y = 400;
styleLetterSpacing.data.text = 'Letter spacing: 4';
styleLetterSpacing.data.textFormat = { font: 'sans-serif', size: 14, letterSpacing: 4, color: 0x666666 };
addNodeChild(root, styleLetterSpacing);

const styleSerifBold = createTextLabel();
styleSerifBold.x = 280;
styleSerifBold.y = 400;
styleSerifBold.data.text = 'Serif bold italic';
styleSerifBold.data.textFormat = { font: 'serif', size: 16, bold: true, italic: true, color: 0x8b4513 };
addNodeChild(root, styleSerifBold);

const styleMonoBold = createTextLabel();
styleMonoBold.x = 500;
styleMonoBold.y = 400;
styleMonoBold.data.text = 'Mono bold';
styleMonoBold.data.textFormat = { font: 'monospace', size: 14, bold: true, color: 0x2a6e3f };
addNodeChild(root, styleMonoBold);

// Section 5: Text with background and border — RichText with background and border colors.

const headingBackgrounds = createTextLabel();
headingBackgrounds.x = 30;
headingBackgrounds.y = 440;
headingBackgrounds.data.text = 'Background & Border';
headingBackgrounds.data.textFormat = { font: 'sans-serif', size: 18, bold: true, color: 0x222222 };
addNodeChild(root, headingBackgrounds);

const bgLight = createRichText();
bgLight.x = 30;
bgLight.y = 468;
bgLight.data.width = 220;
bgLight.data.height = 30;
bgLight.data.text = 'Light background';
bgLight.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0x333333 };
bgLight.data.background = true;
bgLight.data.backgroundColor = 0xf0f0f0;
bgLight.data.border = true;
bgLight.data.borderColor = 0xcccccc;
addNodeChild(root, bgLight);

const bgColored = createRichText();
bgColored.x = 270;
bgColored.y = 468;
bgColored.data.width = 220;
bgColored.data.height = 30;
bgColored.data.text = 'Colored background';
bgColored.data.defaultTextFormat = { font: 'sans-serif', size: 14, color: 0xffffff };
bgColored.data.background = true;
bgColored.data.backgroundColor = 0x336699;
bgColored.data.border = true;
bgColored.data.borderColor = 0x224466;
addNodeChild(root, bgColored);

const bgWarning = createRichText();
bgWarning.x = 510;
bgWarning.y = 468;
bgWarning.data.width = 220;
bgWarning.data.height = 30;
bgWarning.data.text = 'Warning style';
bgWarning.data.defaultTextFormat = { font: 'sans-serif', size: 14, bold: true, color: 0x856404 };
bgWarning.data.background = true;
bgWarning.data.backgroundColor = 0xfff3cd;
bgWarning.data.border = true;
bgWarning.data.borderColor = 0xffc107;
addNodeChild(root, bgWarning);

const bgMultiline = createRichText();
bgMultiline.x = 30;
bgMultiline.y = 515;
bgMultiline.data.width = 350;
bgMultiline.data.wordWrap = true;
bgMultiline.data.multiline = true;
bgMultiline.data.text =
  'A multiline RichText with background and border. ' +
  'Word wrapping is enabled so the text flows within the specified width, ' +
  'and the background and border wrap the content area.';
bgMultiline.data.defaultTextFormat = { font: 'sans-serif', size: 13, color: 0x333333, leading: 3 };
bgMultiline.data.background = true;
bgMultiline.data.backgroundColor = 0xeef6ff;
bgMultiline.data.border = true;
bgMultiline.data.borderColor = 0x99bbdd;
addNodeChild(root, bgMultiline);

const bgCode = createRichText();
bgCode.x = 410;
bgCode.y = 515;
bgCode.data.width = 320;
bgCode.data.wordWrap = true;
bgCode.data.multiline = true;
bgCode.data.text =
  "const label = createTextLabel();\nlabel.data.text = 'Hello Flight';\nlabel.data.textFormat = { font: 'monospace' };";
bgCode.data.defaultTextFormat = { font: 'monospace', size: 13, color: 0xd4d4d4 };
bgCode.data.background = true;
bgCode.data.backgroundColor = 0x1e1e1e;
bgCode.data.border = true;
bgCode.data.borderColor = 0x444444;
addNodeChild(root, bgCode);

function enterFrame(): void {
  render(root as DisplayObject);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
