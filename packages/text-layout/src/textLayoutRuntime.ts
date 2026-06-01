import type { TextLayoutResult, TextRuntime } from '@flighthq/types';

import { createTextLayoutResult } from './textLayout';

export function clearTextLayoutResult(runtime: TextRuntime): void {
  runtime.textLayout = null;
}

export function getTextLayoutResult(runtime: TextRuntime): TextLayoutResult {
  if (runtime.textLayout === null) {
    runtime.textLayout = createTextLayoutResult();
  }
  return runtime.textLayout;
}
