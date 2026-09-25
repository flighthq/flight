import { webHostFontLoading } from './webFontLoading.ts';

describe('webHostFontLoading', () => {
  it('returns a backend with all four operations', () => {
    const backend = webHostFontLoading;
    expect(backend.addFontFace).toBeTypeOf('function');
    expect(backend.checkFontFace).toBeTypeOf('function');
    expect(backend.loadFontFaces).toBeTypeOf('function');
    expect(backend.whenReady).toBeTypeOf('function');
  });
});
