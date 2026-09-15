import { defaultCanvasShapeCommands, defaultCanvasTextureShapeCommands } from './canvasShapeCommands';
import { canvasShapeCommandTable } from './canvasShapeCommandTable';

describe('canvasShapeCommandTable', () => {
  it('holds exactly the default and texture shape commands, one entry per key', () => {
    const table = canvasShapeCommandTable();
    const keys = [...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands].map((command) => command.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(table.entries.size).toBe(keys.length);
  });

  it('includes every default shape command by key', () => {
    const table = canvasShapeCommandTable();
    for (const command of defaultCanvasShapeCommands) {
      expect(table.entries.has(command.key)).toBe(true);
    }
  });

  it('includes every texture shape command by key', () => {
    const table = canvasShapeCommandTable();
    for (const command of defaultCanvasTextureShapeCommands) {
      expect(table.entries.has(command.key)).toBe(true);
    }
  });

  it('returns a new table instance on each call', () => {
    const a = canvasShapeCommandTable();
    const b = canvasShapeCommandTable();
    expect(a).not.toBe(b);
    expect(a.entries.size).toBe(b.entries.size);
  });
});
