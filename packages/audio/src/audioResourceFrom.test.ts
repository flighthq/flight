import { loadAudioResourceFromUrl, loadAudioResourceFromUrls } from './audioResourceFrom';

const mockContext = {
  decodeAudioData: vi.fn().mockResolvedValue({} as AudioBuffer),
} as unknown as AudioContext;

describe('loadAudioResourceFromUrl', () => {
  it('returns a Promise', () => {
    const result = loadAudioResourceFromUrl(mockContext, 'test.mp3');
    result.catch(() => {});
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('loadAudioResourceFromUrls', () => {
  it('resolves immediately with a null-buffer resource when sources is empty', async () => {
    const resource = await loadAudioResourceFromUrls(mockContext, []);
    expect(resource.buffer).toBeNull();
  });
});
