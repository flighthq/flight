import * as native from './debugTiming.native.ts';
import * as timing from './debugTiming.ts';

describe('beginDebugSpan', () => {
  it('is hidden behind the generated implementation', () => {
    expect(timing.beginDebugSpan).not.toBe(native.beginDebugSpan);
  });
});

describe('endDebugSpan', () => {
  it('is hidden behind the generated implementation', () => {
    expect(timing.endDebugSpan).not.toBe(native.endDebugSpan);
  });
});

describe('markDebugFrame', () => {
  it('is hidden behind the generated implementation', () => {
    expect(timing.markDebugFrame).not.toBe(native.markDebugFrame);
  });
});

describe('measureDebugSpan', () => {
  it('remains the native fallback', () => {
    expect(timing.measureDebugSpan).toBe(native.measureDebugSpan);
  });
});
