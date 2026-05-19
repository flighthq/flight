import { clearGraphics, copyGraphics, createGraphics } from './graphics';

describe('clearGraphics', () => {
  it('empties the commands array', () => {
    const g = createGraphics();
    g.commands.push({ type: 'endFill' });
    clearGraphics(g);
    expect(g.commands).toHaveLength(0);
  });
});

describe('copyGraphics', () => {
  it('copies commands from source to target', () => {
    const source = createGraphics();
    source.commands.push({ type: 'endFill' });
    const target = createGraphics();
    copyGraphics(source, target);
    expect(target.commands).toHaveLength(1);
    expect(target.commands[0]).toEqual({ type: 'endFill' });
  });

  it('replaces existing target commands', () => {
    const source = createGraphics();
    source.commands.push({ type: 'endFill' });
    const target = createGraphics();
    target.commands.push({ type: 'endFill' });
    target.commands.push({ type: 'endFill' });
    copyGraphics(source, target);
    expect(target.commands).toHaveLength(1);
  });

  it('does not share the same array reference', () => {
    const source = createGraphics();
    const target = createGraphics();
    copyGraphics(source, target);
    expect(target.commands).not.toBe(source.commands);
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
