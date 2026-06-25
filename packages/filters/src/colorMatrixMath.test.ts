import { COLOR_MATRIX_LENGTH } from './colorMatrixMath';

describe('COLOR_MATRIX_LENGTH', () => {
  it('is 20 (4 rows × 5 columns)', () => {
    expect(COLOR_MATRIX_LENGTH).toBe(20);
  });
});
