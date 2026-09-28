import {
  BitmapFontFormatKindBmFontBinary,
  BitmapFontFormatKindBmFontJson,
  BitmapFontFormatKindBmFontText,
  BitmapFontFormatKindBmFontXml,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { readBitmapFontFormatKind } from './bitmapFontFormatKind.ts';

// ★ THE EXTENSION CANNOT NAME THE FORMAT, WHICH IS THE WHOLE REASON THIS IS SEPARATELY IMPORTABLE. BMFont writes
// binary, text and XML all under `.fnt`, so a build-time analyzer that keyed on the extension would name the text
// parser for a file that is XML and get a null font with no error. These are the same four discriminants the
// detectors in `bitmapFontDetect.ts` ask, asserted here against the module that now owns them.
describe('readBitmapFontFormatKind', () => {
  it('reads the binary form from its BMF version-3 header', () => {
    expect(readBitmapFontFormatKind(new Uint8Array([66, 77, 70, 3, 1, 2, 3]))).toBe(BitmapFontFormatKindBmFontBinary);
  });

  // The version byte is part of the discriminant: the binary front end requires version 3, so a detector that
  // accepted any BMF header would hand it a file it cannot read.
  it('rejects a BMF header at another version rather than claiming it', () => {
    expect(readBitmapFontFormatKind(new Uint8Array([66, 77, 70, 2, 1]))).toBeNull();
  });

  it('reads the XML form only when the root element is font', () => {
    expect(readBitmapFontFormatKind(utf8('<?xml version="1.0"?><font><common lineHeight="10"/></font>'))).toBe(
      BitmapFontFormatKindBmFontXml,
    );
    expect(readBitmapFontFormatKind(utf8('<TextureAtlas imagePath="a.png"/>'))).toBeNull();
  });

  // ★ THE OPENING BRACE IS NOT ENOUGH. `.json` is shared with several families, so a discriminator that claimed
  // every JSON object would put this front end into any build carrying a config file.
  it('reads the JSON form only when the object carries common and chars', () => {
    expect(readBitmapFontFormatKind(utf8('{"common":{"lineHeight":10},"chars":[]}'))).toBe(
      BitmapFontFormatKindBmFontJson,
    );
    expect(readBitmapFontFormatKind(utf8('{"name":"an app config"}'))).toBeNull();
  });

  it('reads the text form from a leading grammar block, and nothing else', () => {
    expect(readBitmapFontFormatKind(utf8('info face="A" size=32\ncommon lineHeight=10\n'))).toBe(
      BitmapFontFormatKindBmFontText,
    );
    expect(readBitmapFontFormatKind(utf8('this is prose, not a font descriptor'))).toBeNull();
  });

  it('returns the null sentinel for empty input rather than throwing', () => {
    expect(readBitmapFontFormatKind(new Uint8Array())).toBeNull();
    expect(readBitmapFontFormatKind(utf8('   \n  '))).toBeNull();
  });

  // Exactly one kind per file is the property the four detectors rest on: each compares this single answer
  // against its own kind, so two of them accepting one file is impossible by construction rather than by policy.
  it('answers at most one kind for any given input', () => {
    const inputs = [
      new Uint8Array([66, 77, 70, 3]),
      utf8('<font><common/></font>'),
      utf8('{"common":{},"chars":[]}'),
      utf8('info face="A"\n'),
    ];
    const kinds = inputs.map((bytes) => readBitmapFontFormatKind(bytes));
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.every((kind) => kind !== null)).toBe(true);
  });
});

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
