import type { CapacitorApi } from '@flighthq/types';

import { createCapacitorDialogBackend } from './capacitorDialog';

function fakeCapacitor(promptResult = { value: 'typed', cancelled: false }) {
  const calls: string[] = [];
  const capacitor = {
    dialog: {
      async alert() {
        calls.push('alert');
      },
      async confirm() {
        calls.push('confirm');
        return { value: true };
      },
      async prompt() {
        calls.push('prompt');
        return promptResult;
      },
    },
  } as unknown as CapacitorApi;
  return { capacitor, calls };
}

describe('createCapacitorDialogBackend', () => {
  it('maps message onto a single-button alert', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorDialogBackend(capacitor);
    const result = await backend.message({ message: 'hello' });
    expect(result).toEqual({ buttonIndex: 0, cancelled: false, checkboxChecked: false });
    expect(calls).toContain('alert');
  });

  it('maps confirm and prompt', async () => {
    const backend = createCapacitorDialogBackend(fakeCapacitor().capacitor);
    expect(await backend.confirm({ message: 'ok?' })).toBe(true);
    expect(await backend.prompt({ message: 'name?' })).toBe('typed');
  });

  it('resolves the null sentinel for a cancelled prompt', async () => {
    const backend = createCapacitorDialogBackend(fakeCapacitor({ value: '', cancelled: true }).capacitor);
    expect(await backend.prompt({ message: 'name?' })).toBeNull();
  });

  it('reports empty results for the absent file picker', async () => {
    const backend = createCapacitorDialogBackend(fakeCapacitor().capacitor);
    expect(await backend.openFile({})).toEqual([]);
    expect(await backend.openDirectory({})).toEqual([]);
    expect(await backend.saveFile({})).toBeNull();
  });
});
