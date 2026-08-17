// text-markup-color — gates that a <font color> tag in parsed markup actually PAINTS that colour, and
// that the surrounding text keeps the default format colour.
//
// WHY A NAMED COLOUR ASSERTION AND NOT A SCREENSHOT HASH. The markup path is exercised today only by the
// text example, which the capture batch compares by screenshot hash. A hash tells you THAT something
// changed, never WHAT — and during a migration that legitimately moves many example hashes, the natural
// response is to re-baseline, which would silently accept markup text that had blanked or shifted
// colour. This scene fails with "the markup <font color> did not paint" instead, so the same regression
// arrives as a diagnosis rather than as noise in a pile of hash diffs.
//
// TWO RUNS, BECAUSE ONE CANNOT SEPARATE THE FAILURES. The first mixes untagged text with a tagged span,
// so BOTH colours must appear in its band — that is what proves a format range survived parsing rather
// than the whole run collapsing to one colour. The second is untagged, and the tag colour must be
// ABSENT from it — that is what proves the range is bounded to its own text rather than applied to the
// document. A single mixed run would pass in both of those failure modes.
//
// Assertions are colour counts over a band, not glyph geometry: which pixels a glyph covers depends on
// the font the host resolves, so pinning shapes would pin the environment. Counting a colour inside a
// band, and requiring zero of it in a band that must not have it, is stable across fonts while still
// being specific.
//
// SCOPE, STATED NARROWLY: one <font color> tag against a default format colour, on single-line rich
// text. It says nothing about the other markup tags (bold, italic, underline), nested tags, sizes, or
// fonts. Read a pass as "a markup colour tag reaches the rasterizer and stays in its own run," never as
// "text markup is covered."
//
// The scene assertion gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any scene assertion runs (functionalVerify.ts).
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createRichText,
  getBitmapPixelRgb,
  parseTextMarkup,
  RichTextKind,
  setRichTextContent,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 400;

const FONT_SIZE = 44;
const TEXT_X = 40;
const MIXED_Y = 60;
const PLAIN_Y = 220;
const BAND_HEIGHT = FONT_SIZE + 20;

// Widely separated so an antialiased edge of one can never satisfy the other's test.
//
// ★ BOTH COLOURS COME FROM THE MARKUP SOURCE, NOT FROM A COLOUR LITERAL IN THIS SCENE. That is
// deliberate and load-bearing: TextFormat.color's numeric convention is under migration, so a scene
// that hand-wrote `color: 0x33ccff` into a defaultTextFormat would itself be a producer using the old
// convention, and would start failing the moment the convention changed — fighting the fix rather than
// guarding it. Every colour here is authored as markup hex and resolved by the markup parser, so the
// scene asserts the CONTRACT ("this hex must paint") and is agnostic to how the value is packed.
const FIRST_HEX = '#33ccff'; // light blue
const SECOND_HEX = '#ff8833'; // orange

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [RichTextKind],
  expectedImageDescription:
    'An 800x400 opaque black field with two lines of text at about 44 px, both starting at x 40: an upper ' +
    'line near y 60-124 and a lower one near y 220-284. The upper line is TWO-COLOURED in one continuous ' +
    'run of letters — its first half, reading PLAIN, is light blue, and its second half, reading TAGGED, ' +
    'is orange, with the colour changing at the boundary between the two words and nowhere else. The ' +
    'lower line, reading UNTAGGED, is entirely light blue with no orange anywhere in it. Both colours ' +
    'present but confined to their own runs is the claim: a single-coloured upper line, or orange ' +
    'leaking into the lower line, is the failure. No box, border or underline anywhere.',
});

const root = createDisplayObject();

// Two differently-coloured spans on one line. Both colours must survive into the same run.
const mixed = createRichText();
mixed.x = TEXT_X;
mixed.y = MIXED_Y;
mixed.data.width = WIDTH - TEXT_X * 2;
mixed.data.height = BAND_HEIGHT;
mixed.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE };
setRichTextContent(
  mixed,
  parseTextMarkup(`<font color="${FIRST_HEX}">PLAIN</font><font color="${SECOND_HEX}">TAGGED</font>`),
);
addNodeChild(root, mixed);

// A run carrying only the FIRST colour: the second must not reach it.
const plain = createRichText();
plain.x = TEXT_X;
plain.y = PLAIN_Y;
plain.data.width = WIDTH - TEXT_X * 2;
plain.data.height = BAND_HEIGHT;
plain.data.defaultTextFormat = { font: 'sans-serif', size: FONT_SIZE };
setRichTextContent(plain, parseTextMarkup(`<font color="${FIRST_HEX}">UNTAGGED</font>`));
addNodeChild(root, plain);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  const mixedFirst = count(at, isFirstColor, MIXED_Y);
  const mixedSecond = count(at, isSecondColor, MIXED_Y);
  const plainFirst = count(at, isFirstColor, PLAIN_Y);
  const plainSecond = count(at, isSecondColor, PLAIN_Y);
  const reading = `mixed(first ${mixedFirst}, second ${mixedSecond}), single(first ${plainFirst}, second ${plainSecond})`;

  if (mixedFirst < 10) {
    throw new Error(`[text-markup-color] the first markup <font color> did not paint — ${reading}`);
  }
  if (mixedSecond < 10) {
    throw new Error(
      `[text-markup-color] the second markup <font color> did not paint — ${reading}. The run rendered ` +
        `in a single colour, so the parsed format range never reached the renderer.`,
    );
  }
  if (plainFirst < 10) {
    throw new Error(`[text-markup-color] the single-colour run did not paint at all — ${reading}`);
  }
  if (plainSecond > 0) {
    throw new Error(
      `[text-markup-color] the second markup colour leaked into a run that never used it — ${reading}. ` +
        `The format range is not bounded to its own text.`,
    );
  }
}

// Steps by a few logical pixels: sparse glyph strokes are still caught and the scan stays cheap.
function count(at: (x: number, y: number) => number, match: (rgb: number) => boolean, bandY: number): number {
  let hits = 0;
  for (let y = bandY; y < bandY + BAND_HEIGHT; y += 3) {
    for (let x = TEXT_X; x < WIDTH - TEXT_X; x += 3) {
      if (match(at(x, y))) hits++;
    }
  }
  return hits;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

// Antialiased glyph edges blend toward the background, so both tests want a solid core of the colour
// rather than anything merely tinted — which also keeps the two from matching each other.
function isFirstColor(rgb: number): boolean {
  return channel(rgb, 0) > 170 && channel(rgb, 8) > 130 && channel(rgb, 16) < 120;
}

function isSecondColor(rgb: number): boolean {
  return channel(rgb, 16) > 170 && channel(rgb, 8) > 90 && channel(rgb, 0) < 110;
}
