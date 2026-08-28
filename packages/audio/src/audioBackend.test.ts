import type { AudioBackend } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  explainAudioBackend,
  getAudioBackend,
  installAudioHostBackend,
  observeAudioHostResult,
  resetAudioBackendForTest,
  setAudioBackend,
} from './audioBackend';

afterEach(() => {
  resetAudioBackendForTest();
});

describe('createWebAudioBackend', () => {
  it('is tested via host-web', () => {
    expect(true).toBe(true);
  });
});

describe('explainAudioBackend', () => {
  it('reports host-not-enabled when no backend is installed', () => {
    const explanation = explainAudioBackend();
    expect(explanation.layer).toBe('host-not-enabled');
    expect(explanation.conflict).toBe(false);
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports host layer when host backend is installed', () => {
    installAudioHostBackend({ canPlayType: () => false });
    const explanation = explainAudioBackend();
    expect(explanation.layer).toBe('host');
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when custom backend is set', () => {
    installAudioHostBackend({ canPlayType: () => false });
    setAudioBackend({ canPlayType: () => true });
    const explanation = explainAudioBackend();
    expect(explanation.layer).toBe('custom');
  });

  it('reports observed viability after observeAudioHostResult', () => {
    installAudioHostBackend({ canPlayType: () => true });
    observeAudioHostResult('canPlayType', true);
    const explanation = explainAudioBackend();
    expect(explanation.viability).toBe('available');
    expect(explanation.operation).toBe('canPlayType');
  });

  it('reports runtime-api-unavailable on failed observation', () => {
    installAudioHostBackend({ canPlayType: () => false });
    observeAudioHostResult('canPlayType', false);
    const explanation = explainAudioBackend();
    expect(explanation.viability).toBe('runtime-api-unavailable');
  });
});

describe('getAudioBackend', () => {
  it('returns sentinel when no backend is installed', () => {
    const backend = getAudioBackend();
    expect(backend.canPlayType('audio/mpeg')).toBe(false);
  });

  it('returns host backend when installed', () => {
    const host: AudioBackend = { canPlayType: () => true };
    installAudioHostBackend(host);
    expect(getAudioBackend()).toBe(host);
  });

  it('returns custom backend over host', () => {
    const host: AudioBackend = { canPlayType: () => false };
    const custom: AudioBackend = { canPlayType: () => true };
    installAudioHostBackend(host);
    setAudioBackend(custom);
    expect(getAudioBackend()).toBe(custom);
  });
});

describe('installAudioHostBackend', () => {
  it('installs the host backend', () => {
    const host: AudioBackend = { canPlayType: () => true };
    installAudioHostBackend(host);
    expect(getAudioBackend()).toBe(host);
  });

  it('detects conflict on double install with different backend', () => {
    installAudioHostBackend({ canPlayType: () => false });
    installAudioHostBackend({ canPlayType: () => true });
    expect(explainAudioBackend().conflict).toBe(true);
  });

  it('does not flag conflict on same backend', () => {
    const host: AudioBackend = { canPlayType: () => false };
    installAudioHostBackend(host);
    installAudioHostBackend(host);
    expect(explainAudioBackend().conflict).toBe(false);
  });
});

describe('observeAudioHostResult', () => {
  it('records the operation and viability', () => {
    installAudioHostBackend({ canPlayType: () => true });
    observeAudioHostResult('canPlayType', true);
    const explanation = explainAudioBackend();
    expect(explanation.operation).toBe('canPlayType');
    expect(explanation.viability).toBe('available');
  });
});

describe('resetAudioBackendForTest', () => {
  it('clears all state', () => {
    installAudioHostBackend({ canPlayType: () => true });
    setAudioBackend({ canPlayType: () => true });
    observeAudioHostResult('canPlayType', true);
    resetAudioBackendForTest();
    expect(explainAudioBackend().layer).toBe('host-not-enabled');
    expect(getAudioBackend().canPlayType('audio/mpeg')).toBe(false);
  });
});

describe('setAudioBackend', () => {
  it('overrides the active backend', () => {
    const custom: AudioBackend = { canPlayType: () => true };
    setAudioBackend(custom);
    expect(getAudioBackend()).toBe(custom);
  });

  it('clears the custom backend when null', () => {
    setAudioBackend({ canPlayType: () => true });
    setAudioBackend(null);
    expect(getAudioBackend().canPlayType('audio/mpeg')).toBe(false);
  });
});
