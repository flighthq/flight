import { createEntity } from '@flighthq/entity/contract';
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

function audioBackend(canPlayType: (mimeType: string) => boolean): AudioBackend {
  return createEntity({ canPlayType });
}

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
    installAudioHostBackend(audioBackend(() => false));
    const explanation = explainAudioBackend();
    expect(explanation.layer).toBe('host');
    expect(explanation.viability).toBe('unobserved');
  });

  it('reports custom layer when custom backend is set', () => {
    installAudioHostBackend(audioBackend(() => false));
    setAudioBackend(audioBackend(() => true));
    const explanation = explainAudioBackend();
    expect(explanation.layer).toBe('custom');
  });

  it('reports observed viability after observeAudioHostResult', () => {
    installAudioHostBackend(audioBackend(() => true));
    observeAudioHostResult('canPlayType', true);
    const explanation = explainAudioBackend();
    expect(explanation.viability).toBe('available');
    expect(explanation.operation).toBe('canPlayType');
  });

  it('reports runtime-api-unavailable on failed observation', () => {
    installAudioHostBackend(audioBackend(() => false));
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
    const host = audioBackend(() => true);
    installAudioHostBackend(host);
    expect(getAudioBackend()).toBe(host);
  });

  it('returns custom backend over host', () => {
    const host = audioBackend(() => false);
    const custom = audioBackend(() => true);
    installAudioHostBackend(host);
    setAudioBackend(custom);
    expect(getAudioBackend()).toBe(custom);
  });
});

describe('installAudioHostBackend', () => {
  it('installs the host backend', () => {
    const host = audioBackend(() => true);
    installAudioHostBackend(host);
    expect(getAudioBackend()).toBe(host);
  });

  it('detects conflict on double install with different backend', () => {
    installAudioHostBackend(audioBackend(() => false));
    installAudioHostBackend(audioBackend(() => true));
    expect(explainAudioBackend().conflict).toBe(true);
  });

  it('does not flag conflict on same backend', () => {
    const host = audioBackend(() => false);
    installAudioHostBackend(host);
    installAudioHostBackend(host);
    expect(explainAudioBackend().conflict).toBe(false);
  });
});

describe('observeAudioHostResult', () => {
  it('records the operation and viability', () => {
    installAudioHostBackend(audioBackend(() => true));
    observeAudioHostResult('canPlayType', true);
    const explanation = explainAudioBackend();
    expect(explanation.operation).toBe('canPlayType');
    expect(explanation.viability).toBe('available');
  });
});

describe('resetAudioBackendForTest', () => {
  it('clears all state', () => {
    installAudioHostBackend(audioBackend(() => true));
    setAudioBackend(audioBackend(() => true));
    observeAudioHostResult('canPlayType', true);
    resetAudioBackendForTest();
    expect(explainAudioBackend().layer).toBe('host-not-enabled');
    expect(getAudioBackend().canPlayType('audio/mpeg')).toBe(false);
  });
});

describe('setAudioBackend', () => {
  it('overrides the active backend', () => {
    const custom = audioBackend(() => true);
    setAudioBackend(custom);
    expect(getAudioBackend()).toBe(custom);
  });

  it('clears the custom backend when null', () => {
    setAudioBackend(audioBackend(() => true));
    setAudioBackend(null);
    expect(getAudioBackend().canPlayType('audio/mpeg')).toBe(false);
  });
});
