import { createDisplayObject } from '@flighthq/displayobject';
import { createRectangle, setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle } from '@flighthq/node';

import { hitTestAreaQuery, hitTestAreaQueryCircle } from './spatialQuery';

function makeAt(x: number, y: number, w: number, h: number) {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), x, y, w, h);
  return obj;
}

describe('hitTestAreaQuery', () => {
  it('collects nodes whose world bounds intersect the query rectangle', () => {
    const root = makeAt(0, 0, 200, 200);
    const a = makeAt(10, 10, 20, 20);
    const b = makeAt(150, 150, 20, 20);
    addNodeChild(root, a);
    addNodeChild(root, b);

    const hits = hitTestAreaQuery(root, createRectangle(0, 0, 50, 50));
    expect(hits).toContain(root);
    expect(hits).toContain(a);
    expect(hits).not.toContain(b);
  });

  it('returns empty array for disabled root', () => {
    const root = makeAt(0, 0, 100, 100);
    root.enabled = false;
    expect(hitTestAreaQuery(root, createRectangle(0, 0, 50, 50))).toEqual([]);
  });
});

describe('hitTestAreaQueryCircle', () => {
  it('collects nodes whose world bounds intersect the query circle', () => {
    const root = makeAt(0, 0, 200, 200);
    const a = makeAt(10, 10, 20, 20);
    const b = makeAt(180, 180, 10, 10);
    addNodeChild(root, a);
    addNodeChild(root, b);

    const hits = hitTestAreaQueryCircle(root, 20, 20, 30);
    expect(hits).toContain(root);
    expect(hits).toContain(a);
    expect(hits).not.toContain(b);
  });
});
