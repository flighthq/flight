import { EntityRuntimeKey } from '@flighthq/types/contract';
import { canPlayVideoType } from '@flighthq/video/contract';
import { describe, expect, it, vi } from 'vitest';

import {
  createWebVideoCapabilityBackend,
  initializeWebVideoCapabilityBackend,
  webVideoCapabilityBackend,
} from './webVideoCapability';

describe('createWebVideoCapabilityBackend', () => {
  it('constructs a backend with canPlayType and createVideoElement', () => {
    const backend = createWebVideoCapabilityBackend();
    expect(backend.canPlayType).toBeTypeOf('function');
    expect(backend.createVideoElement).toBeTypeOf('function');
  });

  it('constructs an identity-bearing provider Entity', () => {
    expect(EntityRuntimeKey in createWebVideoCapabilityBackend()).toBe(true);
  });

  it('returns distinct instances on each call', () => {
    expect(createWebVideoCapabilityBackend()).not.toBe(createWebVideoCapabilityBackend());
  });

  it.each([
    ['', false],
    ['maybe', true],
    ['probably', true],
    ['invalid', false],
  ] as const)('normalizes the browser result %j to %j', (result, expected) => {
    vi.spyOn(HTMLVideoElement.prototype, 'canPlayType').mockReturnValue(result as CanPlayTypeResult);
    const backend = createWebVideoCapabilityBackend();
    expect(canPlayVideoType(backend, 'video/mp4')).toBe(expected);
    vi.restoreAllMocks();
  });

  it('normalizes DOM exceptions to false', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM unavailable');
    });
    const backend = createWebVideoCapabilityBackend();
    expect(canPlayVideoType(backend, 'video/mp4')).toBe(false);
    vi.restoreAllMocks();
  });

  it('createVideoElement returns a video element', () => {
    const backend = createWebVideoCapabilityBackend();
    const element = backend.createVideoElement!();
    expect(element).not.toBeNull();
  });
});

describe('initializeWebVideoCapabilityBackend', () => {
  it('is the construction initializer of createWebVideoCapabilityBackend', () => {
    expect(typeof initializeWebVideoCapabilityBackend).toBe('function');
  });
});
describe('webVideoCapabilityBackend', () => {
  it('is an Entity with canPlayType and createVideoElement', () => {
    expect(EntityRuntimeKey in webVideoCapabilityBackend).toBe(true);
    expect(webVideoCapabilityBackend.canPlayType).toBeTypeOf('function');
    expect(webVideoCapabilityBackend.createVideoElement).toBeTypeOf('function');
  });

  it('is a stable singleton', () => {
    expect(webVideoCapabilityBackend).toBe(webVideoCapabilityBackend);
  });
});
