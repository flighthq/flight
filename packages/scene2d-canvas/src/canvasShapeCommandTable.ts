import { withKindMapEntry } from '@flighthq/registry/contract';
import type { CanvasShapeCommand, Kind } from '@flighthq/types/contract';

import { canvasShapeCommands, canvasTextureShapeCommands } from './canvasShapeCommands';

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
