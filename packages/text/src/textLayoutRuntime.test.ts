import { createTextLabelRuntime } from './contract.ts';
import { clearTextLayoutResult, getTextLayoutResult } from './textLayoutRuntime.ts';

describe('clearTextLayoutResult', () => {
  it('clears the attached layout result', () => {
    const runtime = createTextLabelRuntime();
    getTextLayoutResult(runtime);
    clearTextLayoutResult(runtime);
    expect(runtime.textLayout).toBeNull();
  });
});

describe('getTextLayoutResult', () => {
  it('attaches and reuses a layout result', () => {
    const runtime = createTextLabelRuntime();
    const result = getTextLayoutResult(runtime);
    expect(runtime.textLayout).toBe(result);
    expect(getTextLayoutResult(runtime)).toBe(result);
  });
});
