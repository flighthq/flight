import type { HostTextShaperProvider } from '@flighthq/types/contract';

export let _textShaperBackendHook: ((backend: HostTextShaperProvider | null) => void) | null = null;

export function _setTextShaperBackendHook(hook: ((backend: HostTextShaperProvider | null) => void) | null): void {
  _textShaperBackendHook = hook;
}
