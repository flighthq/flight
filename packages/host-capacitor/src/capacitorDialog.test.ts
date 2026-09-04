import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createCapacitorMessageDialogBackend,
  createCapacitorPromptDialogBackend,
  initializeCapacitorMessageDialogBackend,
  initializeCapacitorPromptDialogBackend,
} from './capacitorDialog';

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
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createCapacitorMessageDialogBackend(fakeCapacitor().capacitor)).toBe(true);
  });

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
  it('returns an Entity', () => {
    expect(EntityRuntimeKey in createCapacitorPromptDialogBackend(fakeCapacitor().capacitor)).toBe(true);
  });

  it('maps prompt', async () => {
    const prompt = createCapacitorPromptDialogBackend(fakeCapacitor().capacitor);
    expect(await prompt.prompt({ message: 'name?' })).toBe('typed');
  });

  it('resolves the null sentinel for a cancelled prompt', async () => {
    const backend = createCapacitorPromptDialogBackend(fakeCapacitor({ value: '', cancelled: true }).capacitor);
    expect(await backend.prompt({ message: 'name?' })).toBeNull();
  });

  it('does not call the plugin for a pre-aborted prompt', async () => {
    const { capacitor, calls } = fakeCapacitor();
    const controller = new AbortController();
    controller.abort();
    const backend = createCapacitorPromptDialogBackend(capacitor);
    await expect(backend.prompt({ message: 'name?', signal: controller.signal })).resolves.toBeNull();
    expect(calls).toEqual([]);
  });
});
describe('initializeCapacitorMessageDialogBackend', () => {
  it('is the construction initializer of createCapacitorMessageDialogBackend', () => {
    expect(typeof initializeCapacitorMessageDialogBackend).toBe('function');
  });
});

describe('initializeCapacitorPromptDialogBackend', () => {
  it('is the construction initializer of createCapacitorPromptDialogBackend', () => {
    expect(typeof initializeCapacitorPromptDialogBackend).toBe('function');
  });
});
