import { addClockChild, removeClockChild } from './addClockChild';
import { createClock } from './createClock';

describe('addClockChild', () => {
  it('attaches a child and sets its parent', () => {
    const parent = createClock();
    const child = createClock();
    addClockChild(parent, child);
    expect(child.parent).toBe(parent);
    expect(parent.children).toEqual([child]);
  });

  it('is a no-op when the child is already parented here', () => {
    const parent = createClock();
    const child = createClock();
    addClockChild(parent, child);
    addClockChild(parent, child);
    expect(parent.children).toEqual([child]);
  });

  it('reparents, detaching from the previous parent first', () => {
    const a = createClock();
    const b = createClock();
    const child = createClock();
    addClockChild(a, child);
    addClockChild(b, child);
    expect(a.children).toEqual([]);
    expect(b.children).toEqual([child]);
    expect(child.parent).toBe(b);
  });
});

describe('removeClockChild', () => {
  it('detaches a child and clears its parent', () => {
    const parent = createClock();
    const child = createClock();
    addClockChild(parent, child);
    removeClockChild(parent, child);
    expect(parent.children).toEqual([]);
    expect(child.parent).toBeNull();
  });

  it('is a no-op when the child is not parented here', () => {
    const parent = createClock();
    const child = createClock();
    expect(() => removeClockChild(parent, child)).not.toThrow();
    expect(parent.children).toEqual([]);
  });
});
