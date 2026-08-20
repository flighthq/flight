import { describe, expect, it } from 'vitest';

import { resolveGateExitStatus } from './reference-image-gate-exit';

describe('resolveGateExitStatus', () => {
  it('exits zero only when the comparison passed and every capture target ran', () => {
    expect(resolveGateExitStatus(0, 0)).toBe(0);
  });

  // ★ THE CASE THIS EXISTS FOR. A scene that fails its own render assertion used to abort the gate with a
  // Node stack trace, so the comparison never ran. Now the run continues — and if that were all, the
  // comparison could exit clean over a SMALLER population and the gate would report success while cells
  // went uncaptured.
  it('fails when captures failed even though the comparison itself passed', () => {
    expect(resolveGateExitStatus(0, 1)).toBe(1);
    expect(resolveGateExitStatus(0, 7)).toBe(1);
  });

  // The comparison's own status wins, so the number a reader sees names the step whose output they were
  // just reading rather than a code invented by the summary.
  it('keeps the comparison status when both went wrong', () => {
    expect(resolveGateExitStatus(2, 3)).toBe(2);
    expect(resolveGateExitStatus(1, 1)).toBe(1);
  });
});
