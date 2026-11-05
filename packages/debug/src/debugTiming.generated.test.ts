import * as contract from './contract.ts';
import * as timing from './debugTiming.ts';
import * as root from './index.ts';

describe('generated debug timing exports', () => {
  it('routes every public timing helper through the generated module', () => {
    expect(contract.beginDebugSpan).toBe(timing.beginDebugSpan);
    expect(contract.endDebugSpan).toBe(timing.endDebugSpan);
    expect(contract.markDebugFrame).toBe(timing.markDebugFrame);
    expect(contract.measureDebugSpan).toBe(timing.measureDebugSpan);
    expect(root.beginDebugSpan).toBe(timing.beginDebugSpan);
    expect(root.endDebugSpan).toBe(timing.endDebugSpan);
    expect(root.markDebugFrame).toBe(timing.markDebugFrame);
    expect(root.measureDebugSpan).toBe(timing.measureDebugSpan);
  });
});
