import {
  createVideoResourceFromUrl,
  createVideoResourceFromUrls,
  loadVideoResourceFromUrl,
  loadVideoResourceFromUrls,
} from './videoResourceFrom';

describe('createVideoResourceFromUrl', () => {
  it('returns a VideoResource with a non-null element', () => {
    const resource = createVideoResourceFromUrl('test.mp4');
    expect(resource.element).not.toBeNull();
  });
});

describe('createVideoResourceFromUrls', () => {
  it('returns a VideoResource with null element when sources is empty', () => {
    const resource = createVideoResourceFromUrls([]);
    expect(resource.element).toBeNull();
  });
});

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
    // jsdom does not implement canPlayType — it returns '' for all sources,
    // so no source is selected and the loader resolves with a null-element resource.
    const resource = await loadVideoResourceFromUrls([{ url: 'test.mp4' }]);
    expect(resource.element).toBeNull();
  });
});
