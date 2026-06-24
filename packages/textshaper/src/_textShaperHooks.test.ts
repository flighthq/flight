import type { TextShaperBackend } from '@flighthq/types';

import { _setTextShaperBackendHook, _textShaperBackendHook } from './_textShaperHooks';
import { setTextShaperBackend } from './textShaper';

const _testBackend: TextShaperBackend = {
  measureText: (text) => text.length,
};

afterEach(() => {
  // Restore module state so an installed hook does not leak across tests.
  _setTextShaperBackendHook(null);
  setTextShaperBackend(null);
});

describe('_setTextShaperBackendHook', () => {
  it('installs the hook so setTextShaperBackend invokes it with the new backend', () => {
    let received: TextShaperBackend | null = _testBackend;
    let calls = 0;
    _setTextShaperBackendHook((backend) => {
      received = backend;
      calls++;
    });
    setTextShaperBackend(_testBackend);
    expect(calls).toBe(1);
    expect(received).toBe(_testBackend);
  });

  it('passes null through to the hook when the backend is cleared', () => {
    let received: TextShaperBackend | null = _testBackend;
    _setTextShaperBackendHook((backend) => {
      received = backend;
    });
    setTextShaperBackend(null);
    expect(received).toBeNull();
  });

  it('exposes the installed hook on the _textShaperBackendHook slot', () => {
    expect(_textShaperBackendHook).toBeNull();
    const hook = (): void => {};
    _setTextShaperBackendHook(hook);
    expect(_textShaperBackendHook).toBe(hook);
  });

  it('clears the hook when passed null so setTextShaperBackend no longer dispatches', () => {
    let calls = 0;
    _setTextShaperBackendHook(() => {
      calls++;
    });
    _setTextShaperBackendHook(null);
    expect(_textShaperBackendHook).toBeNull();
    setTextShaperBackend(_testBackend);
    expect(calls).toBe(0);
  });

  it('replaces a previously installed hook (last write wins)', () => {
    let firstCalls = 0;
    let secondCalls = 0;
    _setTextShaperBackendHook(() => {
      firstCalls++;
    });
    _setTextShaperBackendHook(() => {
      secondCalls++;
    });
    setTextShaperBackend(_testBackend);
    expect(firstCalls).toBe(0);
    expect(secondCalls).toBe(1);
  });
});
