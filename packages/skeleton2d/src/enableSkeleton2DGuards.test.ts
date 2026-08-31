import { clearLogOnceKeys, setLogSink } from '@flighthq/log/contract';
import type { LogEntry } from '@flighthq/types/contract';

import { disableSkeleton2DGuards, enableSkeleton2DGuards } from './enableSkeleton2DGuards';
import { reportSkeleton2DCoercedInterpolation, reportSkeleton2DDeformLengthMismatch } from './skeleton2dGuards';

// Each case uses its own subject string. `logOnce` keys are process-wide with no reset, which is the
// behaviour a shipped app wants — one warning per subject, not one per frame — but it means two cases
// sharing a subject would have the second silently suppressed by the first.
const entries: LogEntry[] = [];

beforeEach(() => {
  clearLogOnceKeys();
  entries.length = 0;
  setLogSink((entry) => void entries.push(entry));
});

afterEach(() => {
  disableSkeleton2DGuards();
  setLogSink(null);
});

describe('disableSkeleton2DGuards', () => {
  it('silences both cases again', () => {
    enableSkeleton2DGuards();
    disableSkeleton2DGuards();

    reportSkeleton2DCoercedInterpolation('DisabledChannel', 'Linear', 'Step');
    reportSkeleton2DDeformLengthMismatch('DisabledAttachment', 6, 8);

    expect(entries).toHaveLength(0);
  });
});

describe('enableSkeleton2DGuards', () => {
  it('says nothing at all until a caller opts in', () => {
    reportSkeleton2DCoercedInterpolation('NeverEnabled', 'Linear', 'Step');

    expect(entries).toHaveLength(0);
  });

  it('names what was stated and what actually happens to a coerced channel', () => {
    enableSkeleton2DGuards();

    reportSkeleton2DCoercedInterpolation('StatedAndApplied', 'Linear', 'Step');

    // The author set an easing and it had no effect. The message has to carry both halves or it does
    // not answer the question that brought them to it.
    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain("states 'Linear'");
    expect(messageOf(entries[0])).toContain("walked as 'Step'");
  });

  it('reports both lengths on a deform mismatch, and why nothing was applied', () => {
    enableSkeleton2DGuards();

    reportSkeleton2DDeformLengthMismatch('BothLengths', 6, 8);

    expect(entries).toHaveLength(1);
    expect(messageOf(entries[0])).toContain('6 values');
    expect(messageOf(entries[0])).toContain('needs 8');
    expect(messageOf(entries[0])).toContain('ignored rather than partly applied');
  });

  it('keys the coercion message per subject, so two families both get heard', () => {
    enableSkeleton2DGuards();

    reportSkeleton2DCoercedInterpolation('PerSubjectOne', 'Linear', 'Step');
    reportSkeleton2DCoercedInterpolation('PerSubjectTwo', 'Linear', 'Step');
    reportSkeleton2DCoercedInterpolation('PerSubjectOne', 'Cubic', 'Step');

    // Two subjects, two messages — and the repeat of the first is collapsed rather than repeated.
    expect(entries).toHaveLength(2);
  });

  it('installs one guard however many times it is enabled', () => {
    enableSkeleton2DGuards();
    enableSkeleton2DGuards();

    reportSkeleton2DDeformLengthMismatch('EnabledTwice', 6, 8);

    expect(entries).toHaveLength(1);
  });
});

function messageOf(entry: Readonly<LogEntry>): string {
  const data = entry.data;
  return typeof data === 'string' ? data : String((data as Readonly<Record<string, unknown>>).message);
}
