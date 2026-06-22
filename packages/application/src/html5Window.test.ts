import { createAppWindow, createHtml5Window } from './html5Window';

describe('createAppWindow', () => {
  it('is an alias for createApplicationWindow', () => {
    const win = createAppWindow();
    expect(win.onResize).toBeDefined();
    expect(win.width).toBe(0);
    expect(win.height).toBe(0);
  });
});

describe('createHtml5Window', () => {
  it('is an alias for createApplicationWindow', () => {
    const win = createHtml5Window();
    expect(win.onResize).toBeDefined();
    expect(win.width).toBe(0);
    expect(win.height).toBe(0);
  });
});
