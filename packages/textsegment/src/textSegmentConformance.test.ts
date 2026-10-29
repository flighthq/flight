import { describe, expect, it } from 'vitest';

import { segmentGraphemes } from './textSegment.ts';
import { webTextSegmenterBackend } from './textSegmenterBackend.ts';
import type { TextSegment } from './types.ts';

const backend = webTextSegmenterBackend;

const graphemeFixtures: ReadonlyArray<{ clusters: string[]; text: string }> = [
  { text: '🇺🇸🇨🇦', clusters: ['🇺🇸', '🇨🇦'] },
  { text: '👨‍👩‍👧', clusters: ['👨‍👩‍👧'] },
  { text: '\r\n', clusters: ['\r\n'] },
  { text: '각', clusters: ['각'] },
];

describe('text segment conformance fixtures', () => {
  it('covers regional indicators, ZWJ emoji, CRLF, and Hangul jamo', () => {
    const segments: TextSegment[] = [];
    for (const fixture of graphemeFixtures) {
      segmentGraphemes(segments, backend, fixture.text);
      expect(segments.map((segment) => segment.text)).toEqual(fixture.clusters);
    }
  });
});
