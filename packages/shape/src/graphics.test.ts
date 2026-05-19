import { clearGraphics, createGraphics } from './graphics';

describe('clearGraphics', () => {
  it('empties the commands array', () => {
    const g = createGraphics();
    g.commands.push({ type: 'endFill' });
    clearGraphics(g);
    expect(g.commands).toHaveLength(0);
  });
});

describe('createGraphics', () => {
  it('returns a Graphics object with an empty commands array', () => {
    const g = createGraphics();
    expect(g.commands).toHaveLength(0);
  });

  it('returns a new object each call', () => {
    expect(createGraphics()).not.toBe(createGraphics());
  });
});
