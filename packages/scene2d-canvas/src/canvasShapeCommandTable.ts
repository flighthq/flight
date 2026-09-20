import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import type { CanvasShapeCommand, KeyedTable } from '@flighthq/types/contract';

import { canvasShapeCommands, canvasTextureShapeCommands } from './canvasShapeCommands';

export function canvasShapeCommandTable(): KeyedTable<CanvasShapeCommand> {
  let table = createKeyedTable<CanvasShapeCommand>('CanvasShapeCommand', 'Unregistered');
  for (const command of canvasShapeCommands) {
    table = withRegistryTableEntry(table, command.key, command);
  }
  for (const command of canvasTextureShapeCommands) {
    table = withRegistryTableEntry(table, command.key, command);
  }
  return table;
}
