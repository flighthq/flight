import { createKeyedTable, withRegistryTableEntry } from '@flighthq/registry/contract';
import type { CanvasShapeCommand, KeyedTable } from '@flighthq/types/contract';

import { defaultCanvasShapeCommands, defaultCanvasTextureShapeCommands } from './canvasShapeCommands';

export function canvasShapeCommandTable(): KeyedTable<CanvasShapeCommand> {
  let table = createKeyedTable<CanvasShapeCommand>('CanvasShapeCommand', 'Unregistered');
  for (const command of defaultCanvasShapeCommands) {
    table = withRegistryTableEntry(table, command.key, command);
  }
  for (const command of defaultCanvasTextureShapeCommands) {
    table = withRegistryTableEntry(table, command.key, command);
  }
  return table;
}
