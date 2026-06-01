import type { TextRuntime } from '@flighthq/types';

import { clearTextLayoutResult, getTextLayoutResult } from './textLayoutRuntime';

function createRuntime(): TextRuntime {
  return { textLayout: null } as TextRuntime;
}

describe('clearTextLayoutResult', () => {
  it('clears the attached layout result', () => {
    const runtime = createRuntime();
    getTextLayoutResult(runtime);
    clearTextLayoutResult(runtime);
    expect(runtime.textLayout).toBeNull();
  });
});

describe('getTextLayoutResult', () => {
  it('attaches a layout result to runtime state', () => {
    const runtime = createRuntime();
    const result = getTextLayoutResult(runtime);
    expect(runtime.textLayout).toBe(result);
  });

  it('reuses an existing layout result', () => {
    const runtime = createRuntime();
    const result = getTextLayoutResult(runtime);
    expect(getTextLayoutResult(runtime)).toBe(result);
  });
});
