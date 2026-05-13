import * as engine from '../src/index';

describe('package exports', () => {
  it('loads successfully', () => {
    expect(engine).toBeDefined();
  });
});
