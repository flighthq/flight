import { describe, expect, it } from 'vitest';

import { segmentGraphemes } from './textSegment';
import { webTextSegmenterBackend } from './textSegmenterBackend';

const backend = webTextSegmenterBackend;

const graphemeFixtures: ReadonlyArray<{ clusters: string[]; text: string }> = [
  { text: '🇺🇸🇨🇦', clusters: ['🇺🇸', '🇨🇦'] },
  { text: '👨‍👩‍👧', clusters: ['👨‍👩‍👧'] },
  { text: '\r\n', clusters: ['\r\n'] },
  { text: '각', clusters: ['각'] },
];

describe('text segment conformance fixtures', () => {
  it('covers regional indicators, ZWJ emoji, CRLF, and Hangul jamo', () => {
    for (const fixture of graphemeFixtures) {
      expect(segmentGraphemes(backend, fixture.text).map((segment) => segment.text)).toEqual(fixture.clusters);
    }
  });
});
