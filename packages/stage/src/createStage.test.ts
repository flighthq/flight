import type { Stage } from '@flighthq/types';

import { createStage } from './createStage';

describe('createStage', () => {
  let stage: Stage;

  beforeEach(() => {
    stage = createStage();
  });

  it('initializes default values', () => {
    expect(stage.data).toBeNull();
  });
});
