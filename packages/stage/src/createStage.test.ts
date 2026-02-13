import { createStage } from './createStage';

describe('createStage', () => {
  it('can be instantiated', () => {
    const stage = createStage();
    expect(stage).not.toBeNull();
  });
});
