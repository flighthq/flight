// Generated from crates/flight-textinput/src/selectable_rich_text_manager.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import { KEY_CODE_A, KEY_CODE_C } from '@flighthq/input/contract';
import type { InputKeyboardData } from '@flighthq/input/contract';
import type { NodeRef } from '@flighthq/node/contract';
import { getRichTextRuntime, getTextLayout, setRichTextScrollV } from '@flighthq/text/contract';
import type { RichText, RichTextRuntime } from '@flighthq/text/contract';
import { computeRichTextCharIndexAtPoint } from '@flighthq/textlayout/contract';

import { jsRound, utf16Len, utf16Slice } from './textUnits.ts';
import type { SelectableRichTextManagerRaw, TextInputCopyCallback } from './types.ts';

export function blurSelectableRichText(manager: SelectableRichTextManagerRaw): void {
  const target = manager!.focused ?? undefined;
  if (target !== undefined) {
    let runtime = getMutableRuntime(target);
    runtime = runtime!;
    runtime.selectionBeginIndex = 0;
    runtime.selectionEndIndex = 0;
  }
  manager!.focused = null;
}

export function createSelectableRichTextManager(): SelectableRichTextManagerRaw {
  let out: SelectableRichTextManagerRaw = Object.assign(allocateEntity<SelectableRichTextManagerRaw>(), {
    focused: null,
  });
  initializeSelectableRichTextManager(out);
  return out;
}

export function dispatchSelectableRichTextKeyDown(
  manager: SelectableRichTextManagerRaw,
  data: Readonly<InputKeyboardData>,
  onCopy?: TextInputCopyCallback,
): boolean {
  const target = manager!.focused ?? undefined;
  if (target === undefined) {
    return false;
  }
  const command = data.ctrlKey || data.metaKey;
  const key: string = data.key;
  if (command && (key.toLowerCase() === 'a' || data.keyCode === KEY_CODE_A)) {
    const textLength = utf16Len(target!.data.text);
    const runtime = getMutableRuntime(target);
    let runtimeGuard = runtime!;
    runtimeGuard.selectionBeginIndex = 0;
    runtimeGuard.selectionEndIndex = textLength;
    return true;
  }
  if (command && (key.toLowerCase() === 'c' || data.keyCode === KEY_CODE_C)) {
    const runtime = getMutableRuntime(target);
    const [start, end] = (() => {
      const runtimeGuard = runtime!;
      return [
        Math.min(runtimeGuard.selectionBeginIndex, runtimeGuard.selectionEndIndex),
        Math.max(runtimeGuard.selectionBeginIndex, runtimeGuard.selectionEndIndex),
      ];
    })();
    const selected = utf16Slice(target!.data.text, start, end);
    if (selected.length !== 0) {
      if (onCopy !== undefined) {
        onCopy(selected);
      }
    }
    return true;
  }
  return false;
}

export function dispatchSelectableRichTextPointerDown(
  manager: SelectableRichTextManagerRaw,
  target: RichText,
  x: number,
  y: number,
  extend: boolean,
): void {
  manager!.focused = target;
  let runtime = getMutableRuntime(target);
  const node: NodeRef = target;
  let layout = getTextLayout(node) ?? undefined;
  if (layout === undefined) {
    if (!extend) {
      runtime = runtime!;
      runtime.selectionBeginIndex = 0;
      runtime.selectionEndIndex = 0;
    }
    return;
  }
  const index = computeRichTextCharIndexAtPoint(layout!, x, y);
  runtime = runtime!;
  if (extend) {
    runtime.selectionEndIndex = index;
  } else {
    runtime.selectionBeginIndex = index;
    runtime.selectionEndIndex = index;
  }
}

export function dispatchSelectableRichTextPointerMove(
  manager: SelectableRichTextManagerRaw,
  x: number,
  y: number,
): void {
  const target = manager!.focused ?? undefined;
  if (target === undefined) {
    return;
  }
  const runtime = getMutableRuntime(target);
  const node: NodeRef = target;
  let layout = getTextLayout(node) ?? undefined;
  if (layout === undefined) {
    return;
  }
  const index = computeRichTextCharIndexAtPoint(layout!, x, y);
  runtime!.selectionEndIndex = index;
}

export function dispatchSelectableRichTextWheel(manager: SelectableRichTextManagerRaw, deltaLines: number): void {
  const target = manager!.focused ?? undefined;
  if (target === undefined) {
    return;
  }
  const scrollV = target!.data.scrollV;
  setRichTextScrollV(target, scrollV + jsRound(deltaLines), undefined);
}

export function focusSelectableRichText(manager: SelectableRichTextManagerRaw, target: RichText): void {
  manager!.focused = target;
}

export function getSelectableRichTextSelectionText(manager: SelectableRichTextManagerRaw): string {
  const target = manager!.focused ?? undefined;
  if (target === undefined) {
    return '';
  }
  let runtime = getMutableRuntime(target);
  runtime = runtime!;
  const start = Math.min(runtime.selectionBeginIndex, runtime.selectionEndIndex);
  const end = Math.max(runtime.selectionBeginIndex, runtime.selectionEndIndex);
  return utf16Slice(target!.data.text, start, end);
}

function getMutableRuntime(source: RichText): RichTextRuntime {
  source = source!;
  return getRichTextRuntime(source);
}

export function initializeSelectableRichTextManager(out: SelectableRichTextManagerRaw): void {
  out.focused = null;
}
