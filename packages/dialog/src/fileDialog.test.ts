import { createEntity } from '@flighthq/entity/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createFileDialogHandle,
  getFileDialogHandleOperations,
  showOpenDirectoryDialog,
  showOpenFileDialog,
  showSaveFileDialog,
} from './fileDialog';

describe('createFileDialogHandle', () => {
  it('creates an Entity handle with provider runtime operations', () => {
    const operations = {
      async readText() {
        return 'text';
      },
    };
    const handle = createFileDialogHandle('File', 'a.txt', null, operations);
    expect(EntityRuntimeKey in handle).toBe(true);
    expect(getFileDialogHandleOperations(handle)).toBe(operations);
  });
});

describe('getFileDialogHandleOperations', () => {
  it('rejects a structural object with no Entity runtime authority', () => {
    expect(getFileDialogHandleOperations({ kind: 'File', name: 'a.txt', path: null } as never)).toBeNull();
  });
});

describe('showOpenDirectoryDialog', () => {
  it('dispatches through the directory-open slot', async () => {
    const host = {
      dialog: {
        directoryOpen: createEntity({
          async open() {
            return { outcome: 'cancelled' as const };
          },
        }),
      },
    };
    await expect(showOpenDirectoryDialog(host)).resolves.toEqual({ outcome: 'cancelled' });
  });
});

describe('showOpenFileDialog', () => {
  it('dispatches through the file-open slot', async () => {
    const host = {
      dialog: {
        fileOpen: createEntity({
          async open() {
            return { outcome: 'cancelled' as const };
          },
        }),
      },
    };
    await expect(showOpenFileDialog(host, {})).resolves.toEqual({ outcome: 'cancelled' });
  });
});

describe('showSaveFileDialog', () => {
  it('dispatches through the file-save slot', async () => {
    const host = {
      dialog: {
        fileSave: createEntity({
          async save() {
            return { outcome: 'cancelled' as const };
          },
        }),
      },
    };
    await expect(showSaveFileDialog(host, {})).resolves.toEqual({ outcome: 'cancelled' });
  });
});
