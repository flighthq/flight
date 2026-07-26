import type { TextShaperBackend } from '@flighthq/types/contract';

export let _textShaperBackendHook: ((backend: TextShaperBackend | null) => void) | null = null;

export function _setTextShaperBackendHook(hook: ((backend: TextShaperBackend | null) => void) | null): void {
  _textShaperBackendHook = hook;
}
