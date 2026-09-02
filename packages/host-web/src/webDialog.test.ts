import { getFileDialogHandleOperations } from '@flighthq/dialog/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  webDirectoryOpenDialogBackend,
  webFileOpenDialogBackend,
  webFileSaveDialogBackend,
  webMessageDialogBackend,
  webPromptDialogBackend,
} from './webDialog';
import { webHost } from './webHost';

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker;
  delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
  delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe('existing web message providers', () => {
  it('remain exported from the host package', () => {
    expect(typeof webMessageDialogBackend.message).toBe('function');
    expect(typeof webPromptDialogBackend.prompt).toBe('function');
  });
});

describe('webDirectoryOpenDialogBackend', () => {
  it('is an Entity installed in the independent directory-open slot', () => {
    expect(EntityRuntimeKey in webDirectoryOpenDialogBackend).toBe(true);
    expect(webDirectoryOpenDialogBackend).not.toBe(webFileOpenDialogBackend);
    expect(webHost.dialog.directoryOpen).toBe(webDirectoryOpenDialogBackend);
  });

  it('reports runtime-unavailable when the required API is absent', async () => {
    expect(await webDirectoryOpenDialogBackend.open()).toEqual({ outcome: 'runtime-unavailable' });
  });

  it('opens a directory in read mode and returns an Entity only after platform selection', async () => {
    let options: unknown;
    (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker = async (value: unknown) => {
      options = value;
      return { kind: 'directory', name: 'docs' };
    };
    const result = await webDirectoryOpenDialogBackend.open();
    expect(options).toEqual({ mode: 'read' });
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(result.handle.kind).toBe('Directory');
      expect(EntityRuntimeKey in result.handle).toBe(true);
    }
  });
});

describe('webFileOpenDialogBackend', () => {
  it('is an Entity installed in the independent file-open slot', () => {
    expect(EntityRuntimeKey in webFileOpenDialogBackend).toBe(true);
    expect(webFileOpenDialogBackend).not.toBe(webDirectoryOpenDialogBackend);
    expect(webFileOpenDialogBackend).not.toBe(webFileSaveDialogBackend);
    expect(webHost.dialog.fileOpen).toBe(webFileOpenDialogBackend);
  });

  it('preserves MIME-extension pairing and multiple selection', async () => {
    let options: unknown;
    (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker = async (value: unknown) => {
      options = value;
      return [fileSystemHandle('picked.png', 'image')];
    };
    const result = await webFileOpenDialogBackend.open({
      filters: [{ accept: { 'image/png': ['png'], 'image/jpeg': ['.jpg', 'jpeg'] }, name: 'Images' }],
      multiple: true,
    });
    expect(options).toEqual({
      multiple: true,
      types: [
        {
          accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
          description: 'Images',
        },
      ],
    });
    expect(result.outcome).toBe('selected');
  });

  it.each([
    ['AbortError', 'cancelled'],
    ['SecurityError', 'security-denied'],
    ['NotAllowedError', 'security-denied'],
    ['UnknownError', 'file-open-failed'],
  ] as const)('classifies %s without collapsing it into a sentinel', async (name, outcome) => {
    (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker = async () => {
      throw Object.assign(new Error(name), { name });
    };
    expect(await webFileOpenDialogBackend.open({})).toEqual({ outcome });
  });

  it('treats a successful but empty platform result as file-open-failed, never selected', async () => {
    (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker = async () => [];
    expect(await webFileOpenDialogBackend.open({})).toEqual({ outcome: 'file-open-failed' });
  });

  it('retains the legacy selected File in provider-neutral handle operations', async () => {
    const input = document.createElement('input');
    const file = {
      name: 'legacy.txt',
      async arrayBuffer() {
        return new TextEncoder().encode('legacy').buffer;
      },
      async text() {
        return 'legacy';
      },
    } as File;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    vi.spyOn(document, 'createElement').mockReturnValue(input as never);

    const pending = webFileOpenDialogBackend.open({});
    input.dispatchEvent(new Event('change'));
    const result = await pending;
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      const operations = getFileDialogHandleOperations(result.handles[0]);
      expect(await operations?.readText?.()).toBe('legacy');
      expect(Array.from((await operations?.readBinary?.()) ?? [])).toEqual(
        Array.from(new TextEncoder().encode('legacy')),
      );
    }
  });

  it('settles focus-return cancellation exactly once and tears down every legacy listener', async () => {
    const input = document.createElement('input');
    const removeInput = vi.spyOn(input, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    vi.spyOn(document, 'createElement').mockReturnValue(input as never);

    let settlements = 0;
    const pending = webFileOpenDialogBackend.open({}).then((result) => {
      settlements++;
      return result;
    });
    window.dispatchEvent(new Event('focus'));
    const result = await pending;
    input.dispatchEvent(new Event('cancel'));

    expect(result).toEqual({ outcome: 'cancelled' });
    expect(settlements).toBe(1);
    expect(removeInput).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeInput).toHaveBeenCalledWith('cancel', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('focus', expect.any(Function));
  });

  it('settles an in-flight legacy picker abort once and removes every listener', async () => {
    const input = document.createElement('input');
    const removeInput = vi.spyOn(input, 'removeEventListener');
    const removeWindow = vi.spyOn(window, 'removeEventListener');
    const controller = new AbortController();
    const removeSignal = vi.spyOn(controller.signal, 'removeEventListener');
    vi.spyOn(document, 'createElement').mockReturnValue(input as never);

    const pending = webFileOpenDialogBackend.open({ signal: controller.signal });
    controller.abort(new Error('cancel picker'));

    await expect(pending).resolves.toEqual({ outcome: 'cancelled' });
    expect(removeInput).toHaveBeenCalledWith('change', expect.any(Function));
    expect(removeInput).toHaveBeenCalledWith('cancel', expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeSignal).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('webFileSaveDialogBackend', () => {
  it('is an Entity installed in the independent file-save slot', () => {
    expect(EntityRuntimeKey in webFileSaveDialogBackend).toBe(true);
    expect(webFileSaveDialogBackend).not.toBe(webFileOpenDialogBackend);
    expect(webHost.dialog.fileSave).toBe(webFileSaveDialogBackend);
  });

  it('reports runtime-unavailable when the required API is absent', async () => {
    expect(await webFileSaveDialogBackend.save({})).toEqual({ outcome: 'runtime-unavailable' });
  });

  it('owns and closes each save writable operation', async () => {
    const writes: unknown[] = [];
    let closes = 0;
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = async () =>
      fileSystemHandle('out.txt', '', {
        async close() {
          closes++;
        },
        async write(data: unknown) {
          writes.push(data);
        },
      });
    const result = await webFileSaveDialogBackend.save({ defaultName: 'out.txt' });
    expect(result.outcome).toBe('selected');
    if (result.outcome === 'selected') {
      expect(await getFileDialogHandleOperations(result.handle)?.writeText?.('saved')).toBe(true);
    }
    expect(writes).toEqual(['saved']);
    expect(closes).toBe(1);
  });

  it('aborts an in-flight handle write and releases the signal listener', async () => {
    const reason = new Error('cancel handle write');
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const abort = vi.fn(async () => {});
    (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker = async () =>
      fileSystemHandle('out.txt', '', {
        abort,
        async close() {},
        async write() {
          controller.abort(reason);
          throw reason;
        },
      });
    const result = await webFileSaveDialogBackend.save({});
    expect(result.outcome).toBe('selected');
    if (result.outcome !== 'selected') return;

    const write = getFileDialogHandleOperations(result.handle)?.writeText;
    await expect(write?.('saved', controller.signal)).rejects.toBe(reason);
    expect(abort).toHaveBeenCalledWith(reason);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

function fileSystemHandle(
  name: string,
  text: string,
  writable?: { abort?(reason?: unknown): Promise<void>; close(): Promise<void>; write(data: unknown): Promise<void> },
) {
  return {
    kind: 'file' as const,
    name,
    async createWritable() {
      if (writable === undefined) throw new Error('not writable');
      return writable;
    },
    async getFile() {
      return {
        async arrayBuffer() {
          return new TextEncoder().encode(text).buffer;
        },
        async text() {
          return text;
        },
      };
    },
  };
}
