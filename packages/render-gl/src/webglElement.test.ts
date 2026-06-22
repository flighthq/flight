import { createGlCanvasElement } from './webglElement';

describe('createGlCanvasElement', () => {
  it('returns an HTMLCanvasElement', () => {
    const canvas = createGlCanvasElement(100, 200);
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('sets pixel dimensions equal to logical size with default pixelRatio', () => {
    const canvas = createGlCanvasElement(100, 200);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(200);
  });

  it('scales pixel dimensions by pixelRatio', () => {
    const canvas = createGlCanvasElement(100, 200, 2);
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(400);
  });

  it('sets CSS style width to the logical width', () => {
    const canvas = createGlCanvasElement(100, 200, 2);
    expect(canvas.style.width).toBe('100px');
  });

  it('sets CSS style height to the logical height', () => {
    const canvas = createGlCanvasElement(100, 200, 2);
    expect(canvas.style.height).toBe('200px');
  });

  it('keeps CSS dimensions unchanged regardless of pixelRatio', () => {
    const canvas = createGlCanvasElement(300, 150, 3);
    expect(canvas.style.width).toBe('300px');
    expect(canvas.style.height).toBe('150px');
    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(450);
  });
});
