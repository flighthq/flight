import { webFileDialogBackend, webMessageDialogBackend, webPromptDialogBackend } from './webDialog';

describe('web dialog capability values', () => {
  it('exports independent file, message, and prompt capabilities', () => {
    expect(typeof webFileDialogBackend.openFile).toBe('function');
    expect(typeof webMessageDialogBackend.confirm).toBe('function');
    expect(typeof webPromptDialogBackend.prompt).toBe('function');
  });
});
