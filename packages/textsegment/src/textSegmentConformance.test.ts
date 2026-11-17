// Generated from crates/flight-textsegment/tests/text_segment_conformance_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { segmentGraphemes, webTextSegmenterBackend } from './contract.ts';
import type { TextSegment } from './contract.ts';

interface GraphemeFixture {
  text: string;
  clusters: Readonly<string[]>;
}

describe('textSegmentConformanceFixtures', () => {
  it('covers regional indicators zwj emoji crlf and hangul jamo', () => {
    const backend = webTextSegmenterBackend;
    const fixtures: Readonly<GraphemeFixture[]> = [
      { text: '🇺🇸🇨🇦', clusters: ['🇺🇸', '🇨🇦'] },
      { text: '👨‍👩‍👧', clusters: ['👨‍👩‍👧'] },
      { text: '\r\n', clusters: ['\r\n'] },
      { text: '각', clusters: ['각'] },
    ];
    for (const fixture of fixtures) {
      let segments: TextSegment[] = [];
      segmentGraphemes(segments, backend, fixture.text, undefined);
      const texts: string[] = segments.map((s) => s.text);
      expect(texts, `Failed for text: ${JSON.stringify(fixture.text)}`).toEqual(fixture.clusters);
    }
  });
});
