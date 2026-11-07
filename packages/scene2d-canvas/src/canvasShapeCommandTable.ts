import type { Kind } from '@flighthq/entity/contract';
import { withKindMapEntry } from '@flighthq/registry/contract';

import { canvasShapeCommands, canvasTextureShapeCommands } from './canvasShapeCommands.ts';
import type { CanvasShapeCommand } from './types/CanvasShape.ts';

export function canvasShapeCommandTable(): ReadonlyMap<Kind, CanvasShapeCommand> {
  let table: ReadonlyMap<Kind, CanvasShapeCommand> = new Map();
  for (const command of canvasShapeCommands) {
    table = withKindMapEntry(table, command.key, command);
  }
  for (const command of canvasTextureShapeCommands) {
    table = withKindMapEntry(table, command.key, command);
  }
  return table;
}
