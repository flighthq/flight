import type { CapacitorApi } from '@flighthq/types/contract';

import { createCapacitorMessageDialogBackend, createCapacitorPromptDialogBackend } from './capacitorDialog';

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

describe('createCapacitorMessageDialogBackend', () => {
  it('maps message onto a single-button alert', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const backend = createCapacitorMessageDialogBackend(capacitor);
    const result = await backend.message({ message: 'hello' });
    expect(result).toEqual({ buttonIndex: 0, cancelled: false, checkboxChecked: false });
    expect(calls).toContain('alert');
  });

  it('maps confirm', async () => {
    const message = createCapacitorMessageDialogBackend(fakeCapacitor().capacitor);
    expect(await message.confirm({ message: 'ok?' })).toBe(true);
  });
});

describe('createCapacitorPromptDialogBackend', () => {
  it('maps prompt', async () => {
    const prompt = createCapacitorPromptDialogBackend(fakeCapacitor().capacitor);
    expect(await prompt.prompt({ message: 'name?' })).toBe('typed');
  });

  it('resolves the null sentinel for a cancelled prompt', async () => {
    const backend = createCapacitorPromptDialogBackend(fakeCapacitor({ value: '', cancelled: true }).capacitor);
    expect(await backend.prompt({ message: 'name?' })).toBeNull();
  });
});
