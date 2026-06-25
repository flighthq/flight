import { createParticleEmitterConfig } from '@flighthq/particles';

import type { ParticleFormatCodec } from './formatRegistry';
import {
  detectRegisteredParticleFormat,
  getParticleFormatCodec,
  getRegisteredParticleFormats,
  parseRegisteredParticleFormat,
  registerParticleFormat,
  unregisterParticleFormat,
} from './formatRegistry';

// A minimal test codec for use across all tests
const TEST_KIND = 'test.MyFormat';
const testCodec: ParticleFormatCodec = {
  detect: (text) => text.startsWith('MY_FORMAT:'),
  parseToConfig: (text) => createParticleEmitterConfig({ maxParticles: parseInt(text.slice(10), 10) || 50 }),
  parseToDocument: (text) => ({
    config: createParticleEmitterConfig({ maxParticles: parseInt(text.slice(10), 10) || 50 }),
    warnings: [],
  }),
  serialize: () => ({ text: 'MY_FORMAT:50', warnings: [] }),
};

describe('detectRegisteredParticleFormat', () => {
  it('returns the kind when a codec detects the input', () => {
    registerParticleFormat(TEST_KIND, testCodec);
    expect(detectRegisteredParticleFormat('MY_FORMAT:100')).toBe(TEST_KIND);
    unregisterParticleFormat(TEST_KIND);
  });
  it('returns null when no codec matches', () => {
    expect(detectRegisteredParticleFormat('totally unknown')).toBeNull();
  });
  it('ignores codecs that throw in detect()', () => {
    const throwingCodec: ParticleFormatCodec = {
      ...testCodec,
      detect: () => {
        throw new Error('boom');
      },
    };
    registerParticleFormat(TEST_KIND, throwingCodec);
    expect(() => detectRegisteredParticleFormat('anything')).not.toThrow();
    unregisterParticleFormat(TEST_KIND);
  });
});

describe('getParticleFormatCodec', () => {
  it('returns null when no codec is registered for the kind', () => {
    expect(getParticleFormatCodec('nope.Missing')).toBeNull();
  });
  it('returns the registered codec', () => {
    registerParticleFormat(TEST_KIND, testCodec);
    expect(getParticleFormatCodec(TEST_KIND)).toBe(testCodec);
    unregisterParticleFormat(TEST_KIND);
  });
});

describe('getRegisteredParticleFormats', () => {
  it('returns an array including newly registered kinds', () => {
    registerParticleFormat(TEST_KIND, testCodec);
    expect(getRegisteredParticleFormats()).toContain(TEST_KIND);
    unregisterParticleFormat(TEST_KIND);
  });
  it('does not include unregistered kinds', () => {
    registerParticleFormat(TEST_KIND, testCodec);
    unregisterParticleFormat(TEST_KIND);
    expect(getRegisteredParticleFormats()).not.toContain(TEST_KIND);
  });
});

describe('parseRegisteredParticleFormat', () => {
  it('parses using the registered codec and returns config and format', () => {
    registerParticleFormat(TEST_KIND, testCodec);
    const result = parseRegisteredParticleFormat('MY_FORMAT:75', TEST_KIND);
    expect(result.format).toBe(TEST_KIND);
    expect(result.config.maxParticles).toBe(75);
    expect(result.warnings).toEqual([]);
    unregisterParticleFormat(TEST_KIND);
  });
  it('returns a default config with unknown-format warning when no codec is registered', () => {
    const result = parseRegisteredParticleFormat('whatever', 'nope.Missing');
    expect(result.config).toBeDefined();
    expect(result.warnings.some((w) => w.includes('unknown-format'))).toBe(true);
  });
  it('catches codec parse errors and returns them as parse-error warnings', () => {
    const errCodec: ParticleFormatCodec = {
      ...testCodec,
      parseToDocument: () => {
        throw new Error('bad input');
      },
    };
    registerParticleFormat(TEST_KIND, errCodec);
    const result = parseRegisteredParticleFormat('MY_FORMAT:bad', TEST_KIND);
    expect(result.warnings.some((w) => w.includes('parse-error'))).toBe(true);
    unregisterParticleFormat(TEST_KIND);
  });
});

describe('registerParticleFormat', () => {
  it('is last-write-wins: second registration replaces the first', () => {
    const codec1: ParticleFormatCodec = { ...testCodec, detect: () => true };
    const codec2: ParticleFormatCodec = { ...testCodec, detect: () => false };
    registerParticleFormat(TEST_KIND, codec1);
    registerParticleFormat(TEST_KIND, codec2);
    expect(getParticleFormatCodec(TEST_KIND)).toBe(codec2);
    unregisterParticleFormat(TEST_KIND);
  });
});

describe('unregisterParticleFormat', () => {
  it('returns true when a codec is found and removed', () => {
    registerParticleFormat(TEST_KIND, testCodec);
    expect(unregisterParticleFormat(TEST_KIND)).toBe(true);
  });
  it('returns false when no codec was registered for the kind', () => {
    expect(unregisterParticleFormat('nope.NotRegistered')).toBe(false);
  });
});
