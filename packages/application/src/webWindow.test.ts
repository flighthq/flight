import { createAppWindow, createWebWindow } from './webWindow';

describe('createAppWindow', () => {
  it('is an alias for createApplicationWindow', () => {
    const win = createAppWindow();
    expect(win.onResize).toBeDefined();
    expect(win.width).toBe(0);
    expect(win.height).toBe(0);
  });
});

describe('createWebWindow', () => {
  it('is an alias for createApplicationWindow', () => {
    const win = createWebWindow();
    expect(win.onResize).toBeDefined();
    expect(win.width).toBe(0);
    expect(win.height).toBe(0);
  });
});
