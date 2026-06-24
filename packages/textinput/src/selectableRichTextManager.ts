import { getRichTextRuntime, setRichTextScrollV } from '@flighthq/text';
import { getRichTextCharIndexAtPoint } from '@flighthq/textlayout';
import type { InputKeyboardData, RichText, RichTextRuntime, SelectableRichTextManager } from '@flighthq/types';
import { KeyCode } from '@flighthq/types';

export function blurSelectableRichText(manager: SelectableRichTextManager): void {
  if (manager.focused !== null) {
    const runtime = getMutableRuntime(manager.focused);
    runtime.selectionBeginIndex = 0;
    runtime.selectionEndIndex = 0;
  }
  manager.focused = null;
}

export function createSelectableRichTextManager(): SelectableRichTextManager {
  return { focused: null };
}

export function dispatchSelectableRichTextKeyDown(
  manager: SelectableRichTextManager,
  data: Readonly<InputKeyboardData>,
  onCopy?: (text: string) => void,
): boolean {
  const target = manager.focused;
  if (target === null) return false;
  if ((data.ctrlKey || data.metaKey) && (data.key.toLowerCase() === 'a' || data.keyCode === KeyCode.A)) {
    const runtime = getMutableRuntime(target);
    runtime.selectionBeginIndex = 0;
    runtime.selectionEndIndex = target.data.text.length;
    return true;
  }
  if ((data.ctrlKey || data.metaKey) && (data.key.toLowerCase() === 'c' || data.keyCode === KeyCode.C)) {
    const runtime = getMutableRuntime(target);
    const start = Math.min(runtime.selectionBeginIndex, runtime.selectionEndIndex);
    const end = Math.max(runtime.selectionBeginIndex, runtime.selectionEndIndex);
    const selected = target.data.text.slice(start, end);
    if (selected.length > 0) onCopy?.(selected);
    return true;
  }
  return false;
}

export function dispatchSelectableRichTextPointerDown(
  manager: SelectableRichTextManager,
  target: RichText,
  x: number,
  y: number,
  extend = false,
): void {
  manager.focused = target;
  const runtime = getMutableRuntime(target);
  const layout = runtime.textLayout;
  if (layout === null) {
    if (!extend) {
      runtime.selectionBeginIndex = 0;
      runtime.selectionEndIndex = 0;
    }
    return;
  }
  const content = runtime.richTextContent;
  const text = content?.text ?? target.data.text;
  const index = getRichTextCharIndexAtPoint(text, layout, x, y);
  if (extend) {
    runtime.selectionEndIndex = index;
  } else {
    runtime.selectionBeginIndex = index;
    runtime.selectionEndIndex = index;
  }
}

export function dispatchSelectableRichTextPointerMove(manager: SelectableRichTextManager, x: number, y: number): void {
  const target = manager.focused;
  if (target === null) return;
  const runtime = getMutableRuntime(target);
  const layout = runtime.textLayout;
  if (layout === null) return;
  const content = runtime.richTextContent;
  const text = content?.text ?? target.data.text;
  runtime.selectionEndIndex = getRichTextCharIndexAtPoint(text, layout, x, y);
}

export function dispatchSelectableRichTextWheel(manager: SelectableRichTextManager, deltaLines: number): void {
  const target = manager.focused;
  if (target === null) return;
  setRichTextScrollV(target, target.data.scrollV + Math.round(deltaLines));
}

export function focusSelectableRichText(manager: SelectableRichTextManager, target: RichText): void {
  manager.focused = target;
}

export function getSelectableRichTextSelectionText(manager: SelectableRichTextManager): string {
  const target = manager.focused;
  if (target === null) return '';
  const runtime = getMutableRuntime(target);
  const start = Math.min(runtime.selectionBeginIndex, runtime.selectionEndIndex);
  const end = Math.max(runtime.selectionBeginIndex, runtime.selectionEndIndex);
  return target.data.text.slice(start, end);
}

function getMutableRuntime(source: RichText): RichTextRuntime {
  return getRichTextRuntime(source) as RichTextRuntime;
}
