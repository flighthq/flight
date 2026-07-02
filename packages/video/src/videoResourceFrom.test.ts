import { loadVideoResourceFromUrl, loadVideoResourceFromUrls } from './videoResourceFrom';

describe('loadVideoResourceFromUrl', () => {
  it('returns a Promise', () => {
    const result = loadVideoResourceFromUrl('test.mp4');
    result.catch(() => {});
    expect(result).toBeInstanceOf(Promise);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('pre-aborted');
    controller.abort(reason);
    await expect(loadVideoResourceFromUrl('test.mp4', controller.signal)).rejects.toThrow('pre-aborted');
  });

  it('rejects when the signal is aborted after the call', async () => {
    const controller = new AbortController();
    const promise = loadVideoResourceFromUrl('test.mp4', controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(promise).rejects.toThrow('cancelled');
  });
});

describe('loadVideoResourceFromUrls', () => {
  it('resolves immediately with a null-element resource when sources is empty', async () => {
    const resource = await loadVideoResourceFromUrls([]);
    expect(resource.element).toBeNull();
  });

  it('resolves to a null-element resource when no source passes canPlayType in jsdom', async () => {
    const resource = await loadVideoResourceFromUrls([{ url: 'test.mp4' }]);
    expect(resource.element).toBeNull();
  });
});
