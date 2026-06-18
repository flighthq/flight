import {
  cloneImageResource,
  createImageResource,
  disposeImageResource,
  hasImageResourceSource,
  invalidateImageResource,
  isImageResourceEmpty,
  setImageResourceSource,
} from './imageResource';

describe('cloneImageResource', () => {
  it('copies fields, shares the element, and gives an independent identity', () => {
    const element = { width: 4, height: 5 } as HTMLImageElement;
    const resource = createImageResource(element);
    resource.version = 3;

    const copy = cloneImageResource(resource);

    expect(copy).not.toBe(resource);
    expect(copy.source).toBe(element);
    expect(copy.width).toStrictEqual(4);
    expect(copy.height).toStrictEqual(5);
    expect(copy.version).toStrictEqual(3);

    copy.version++;
    expect(resource.version).toStrictEqual(3);
  });
});

describe('createImageResource', () => {
  it('returns an object', () => {
    const resource = createImageResource();
    expect(resource).not.toBeNull();
  });

  it('sets source, width and height if you pass in a source element', () => {
    const element = { width: 100, height: 100 } as HTMLImageElement;
    const resource = createImageResource(element);
    expect(resource.source).toStrictEqual(element);
    expect(resource.width).toStrictEqual(element.width);
    expect(resource.height).toStrictEqual(element.height);
  });

  it('starts at version 0', () => {
    expect(createImageResource().version).toBe(0);
  });
});

describe('disposeImageResource', () => {
  it('releases the element and marks the resource changed', () => {
    const resource = createImageResource({ width: 4, height: 5 } as HTMLImageElement);
    const before = resource.version;

    disposeImageResource(resource);

    expect(resource.source).toBeNull();
    expect(resource.version).toStrictEqual(before + 1);
  });
});

describe('hasImageResourceSource', () => {
  it('is false without an element and true with one', () => {
    expect(hasImageResourceSource(createImageResource())).toStrictEqual(false);
    expect(hasImageResourceSource(createImageResource({ width: 1, height: 1 } as HTMLImageElement))).toStrictEqual(
      true,
    );
  });
});

describe('invalidateImageResource', () => {
  it('increments the version', () => {
    const resource = createImageResource();
    invalidateImageResource(resource);
    expect(resource.version).toBe(1);
    invalidateImageResource(resource);
    expect(resource.version).toBe(2);
  });

  it('wraps around with >>> 0', () => {
    const resource = createImageResource();
    resource.version = 0xffffffff;
    invalidateImageResource(resource);
    expect(resource.version).toBe(0);
  });
});

describe('isImageResourceEmpty', () => {
  it('is true with no dimensions and false once sized', () => {
    expect(isImageResourceEmpty(createImageResource())).toStrictEqual(true);
    expect(isImageResourceEmpty(createImageResource({ width: 2, height: 2 } as HTMLImageElement))).toStrictEqual(false);
  });
});

describe('setImageResourceSource', () => {
  it('swaps the element, re-reads dimensions, and marks the resource changed', () => {
    const resource = createImageResource();
    const before = resource.version;
    const element = { width: 8, height: 6 } as HTMLImageElement;

    setImageResourceSource(resource, element);

    expect(resource.source).toBe(element);
    expect(resource.width).toStrictEqual(8);
    expect(resource.height).toStrictEqual(6);
    expect(resource.version).toStrictEqual(before + 1);
  });

  it('clears the element when passed null', () => {
    const resource = createImageResource({ width: 8, height: 6 } as HTMLImageElement);

    setImageResourceSource(resource, null);

    expect(resource.source).toBeNull();
  });
});
