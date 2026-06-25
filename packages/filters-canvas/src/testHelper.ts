import { vi } from 'vitest';

export function makeDestCtxMock(): CanvasRenderingContext2D {
  return {
    drawImage: vi.fn(),
    filter: 'none',
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

export function stubOffscreenCanvas(): void {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(_width: number, _height: number) {}
      getContext(_type: string) {
        return makeDestCtxMock();
      }
    },
  );
}
