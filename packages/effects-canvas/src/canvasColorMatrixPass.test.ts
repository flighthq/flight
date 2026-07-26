import { applyColorMatrixPassToCanvas } from './canvasColorMatrixPass';

const { drawCanvasImageDataPass } = vi.hoisted(() => ({ drawCanvasImageDataPass: vi.fn() }));

vi.mock('./canvasEffectCompositing', () => ({ drawCanvasImageDataPass }));

describe('applyColorMatrixPassToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyColorMatrixPassToCanvas).toBe('function');
  });

  it('converts normalized-linear matrix bias to the ImageData byte domain', () => {
    drawCanvasImageDataPass.mockImplementationOnce((_dest, _source, transform) => {
      const data = new Uint8ClampedArray([0, 0, 0, 255]);
      transform(data, 1);
      expect(Array.from(data)).toEqual([128, 64, 0, 255]);
    });
    const matrix = [1, 0, 0, 0, 0.5, 0, 1, 0, 0, 0.25, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    applyColorMatrixPassToCanvas({} as never, {} as never, matrix);
    expect(drawCanvasImageDataPass).toHaveBeenCalledOnce();
  });
});
