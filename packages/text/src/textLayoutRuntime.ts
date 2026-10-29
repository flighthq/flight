import { createTextLayoutResult } from '@flighthq/textlayout/contract';
import type { TextLayoutResult } from '@flighthq/textlayout/contract';

import type { TextLabelRuntime } from './types.ts';

export function clearTextLayoutResult(runtime: TextLabelRuntime): void {
  runtime.textLayout = null;
}

export function getTextLayoutResult(runtime: TextLabelRuntime): TextLayoutResult {
  if (runtime.textLayout === null) {
    runtime.textLayout = createTextLayoutResult();
  }
  return runtime.textLayout;
}
