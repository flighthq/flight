import type { TextLabelRuntime, TextLayoutResult } from '@flighthq/types/contract';

import { createTextLayoutResult } from './textLayout';

export function clearTextLayoutResult(runtime: TextLabelRuntime): void {
  runtime.textLayout = null;
}

export function getTextLayoutResult(runtime: TextLabelRuntime): TextLayoutResult {
  if (runtime.textLayout === null) {
    runtime.textLayout = createTextLayoutResult();
  }
  return runtime.textLayout;
}
