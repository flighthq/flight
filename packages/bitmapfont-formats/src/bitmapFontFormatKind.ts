import { decodeUTF8 } from '@flighthq/encoding/contract';
import type { BitmapFontFormatKind } from '@flighthq/types/contract';
import {
  BitmapFontFormatKindBmFontBinary,
  BitmapFontFormatKindBmFontJson,
  BitmapFontFormatKindBmFontText,
  BitmapFontFormatKindBmFontXml,
} from '@flighthq/types/contract';

/**
 * The bitmap-font content discrimination, with NO registry behind it.
 *
 * ★ IT LIVES HERE SO A CALLER CAN ASK WHICH FORMAT A FILE IS WITHOUT INSTALLING FOUR PARSERS. This was a private
 * function of `bitmapFontDetect.ts`, which is also where the registry, the appliers and all four front ends live —
 * so the only way to reach the answer was to import the module that seeds the full preset. A build-time analyzer
 * needs exactly this answer and none of that: it reads a `.fnt`, learns which ONE of the three forms BMFont wrote,
 * and names that parser alone. The four detectors in `bitmapFontDetect.ts` still ask this same function, so the
 * move cannot make a detector and the analyzer disagree.
 *
 * It is a pure function of bytes. It registers nothing, reads no module state, and pulls in no front end.
 */
/**
 * The ONE discrimination all four built-in detectors ask, which is what makes them mutually exclusive.
 *
 * Each detector compares this answer against its own kind, so exactly one can be true for any file and none of
 * them is a broad net another has to be registered ahead of. That matters unusually much for this family: BMFont
 * writes all three of its `.fnt` forms — binary, text and XML — under the SAME extension, so the format is
 * knowable only from the content and a loose detector has nothing to fall back on.
 *
 * The four discriminants are format facts and cannot overlap by construction:
 *  - binary: the three bytes `BMF` followed by version 3, which is the exact header the binary front end
 *    requires, so a detector and its parser cannot disagree.
 *  - XML: the first non-space character is `<` and the root element is `<font>`, which is the root the XML front
 *    end requires.
 *  - JSON: the first non-space character is `{` AND the object carries the `common` and `chars` blocks the JSON
 *    front end requires. The extra condition is not decoration: `.json` is shared with seven other families, so
 *    a detector that claimed every JSON object would link this front end into any build with a config file.
 *  - text: neither of the above, and a line whose first token is one of the grammar's own block names.
 *
 * Only the first bytes are decoded for the text discrimination — a font descriptor carries thousands of char
 * lines and detection runs over every candidate asset in a build, so reading the whole file to find out it is a
 * font at all would be paid once per registered format.
 */
export function readBitmapFontFormatKind(bytes: Readonly<Uint8Array>): BitmapFontFormatKind | null {
  if (bytes.length >= 4 && bytes[0] === 66 && bytes[1] === 77 && bytes[2] === 70 && bytes[3] === 3) {
    return BitmapFontFormatKindBmFontBinary;
  }
  const head = decodeUTF8(bytes, 0, Math.min(bytes.length, DETECT_WINDOW_BYTES));
  const trimmed = head.trimStart();
  if (trimmed === '') return null;
  if (trimmed.startsWith('<')) {
    return readXmlRootElementName(trimmed) === 'font' ? BitmapFontFormatKindBmFontXml : null;
  }
  if (trimmed.startsWith('{')) return isBmFontJsonObject(bytes) ? BitmapFontFormatKindBmFontJson : null;
  return hasBmFontTextBlock(trimmed) ? BitmapFontFormatKindBmFontText : null;
}

/**
 * Whether the bytes are a JSON object carrying the two blocks the JSON front end requires.
 *
 * ★ THE OPENING BRACE IS NOT ENOUGH, AND THE COMPOSITE ANALYZER IS WHAT PROVED IT. `.json` is shared with seven
 * other format families, so claiming every JSON object put the BMFont JSON front end into the bundle of any build
 * with an app config or a Tiled map beside its assets — the exact bundle inflation content-aware analysis exists
 * to prevent. Requiring `common` and `chars` asks the same question `parseBitmapFontJson` asks (it returns null
 * without either), so the detector still cannot disagree with its parser.
 *
 * This is the one branch that decodes and parses the WHOLE document rather than the detection window: a `chars`
 * array carries thousands of entries and can push `common` past any fixed prefix, so a windowed answer here would
 * be wrong for exactly the large fonts it was meant to make cheap. The sibling JSON families pay the same cost.
 */
function isBmFontJsonObject(bytes: Readonly<Uint8Array>): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(decodeUTF8(bytes));
  } catch {
    return false;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as { chars?: unknown; common?: unknown };
  const hasChars = Array.isArray(obj.chars) || (obj.chars !== null && typeof obj.chars === 'object');
  return hasChars && obj.common !== null && typeof obj.common === 'object';
}

// Whether the head of a text document opens with one of the BMFont text grammar's own block names. `info` and
// `common` are the two blocks every writer emits first; `page` and `char` are accepted so a fragment that omits
// the header is still recognised as this grammar rather than as prose.
function hasBmFontTextBlock(head: string): boolean {
  for (const rawLine of head.split(/\r\n?|\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const spaceAt = line.search(/\s/);
    const tag = spaceAt < 0 ? line : line.slice(0, spaceAt);
    if (tag === 'info' || tag === 'common' || tag === 'page' || tag === 'char' || tag === 'chars') return true;
    return false;
  }
  return false;
}

// The name of the first ELEMENT in an XML document, skipping the declaration, comments and the doctype, or
// `null` when the text does not open an element.
function readXmlRootElementName(trimmed: string): string | null {
  let index = 0;
  while (index < trimmed.length) {
    if (!trimmed.startsWith('<', index)) {
      const next = trimmed.indexOf('<', index);
      if (next < 0) return null;
      index = next;
      continue;
    }
    if (trimmed.startsWith('<?', index) || trimmed.startsWith('<!', index)) {
      const comment = trimmed.startsWith('<!--', index);
      const close = comment ? trimmed.indexOf('-->', index) : trimmed.indexOf('>', index);
      if (close < 0) return null;
      index = close + (comment ? 3 : 1);
      continue;
    }
    const match = /^<([A-Za-z_][\w.:-]*)/.exec(trimmed.slice(index));
    return match === null ? null : match[1];
  }
  return null;
}

// Enough to carry an XML declaration, a doctype, a comment and the first grammar line of any of the three text
// forms. A descriptor whose first block starts further in than this is not something any BMFont writer emits.
const DETECT_WINDOW_BYTES = 4096;
