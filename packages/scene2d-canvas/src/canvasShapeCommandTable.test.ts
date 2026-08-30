import { defaultCanvasShapeCommands, defaultCanvasTextureShapeCommands } from './canvasShapeCommands';
import { canvasShapeCommandTable } from './canvasShapeCommandTable';

describe('canvasShapeCommandTable', () => {
  it('returns a table with all 16 standard shape commands (14 default + 2 texture)', () => {
    const table = canvasShapeCommandTable();
    expect(table.entries.size).toBe(16);
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
