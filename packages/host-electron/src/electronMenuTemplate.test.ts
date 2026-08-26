import { toElectronTemplate } from './electronMenuTemplate';

describe('toElectronTemplate', () => {
  it('maps Flight roles and omits unsupported custom roles', () => {
    const template = toElectronTemplate([
      { label: 'Fullscreen', role: 'toggleFullscreen' },
      { label: 'Help', role: 'helpMenu' },
      { label: 'Custom', role: 'acme.custom' },
    ]);

    expect(template.map((item) => item.role)).toEqual(['togglefullscreen', 'help', undefined]);
  });

  it('recursively wires selectable ids', () => {
    const selected: string[] = [];
    const template = toElectronTemplate([{ label: 'File', submenu: [{ id: 'open', label: 'Open' }] }], (id) =>
      selected.push(id),
    );

    template[0].submenu?.[0].click?.();
    expect(selected).toEqual(['open']);
  });
});
