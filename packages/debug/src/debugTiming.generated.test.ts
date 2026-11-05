import * as generated from './debugTiming.generated.ts';
import * as timing from './debugTiming.ts';

describe('beginDebugSpan', () => {
  it('is routed through the generated implementation', () => {
    expect(timing.beginDebugSpan).toBe(generated.beginDebugSpan);
  });
});

describe('endDebugSpan', () => {
  it('is routed through the generated implementation', () => {
    expect(timing.endDebugSpan).toBe(generated.endDebugSpan);
  });
});

describe('markDebugFrame', () => {
  it('is routed through the generated implementation', () => {
    expect(timing.markDebugFrame).toBe(generated.markDebugFrame);
  });
});
