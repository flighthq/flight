import { nullSignalEmit } from '@flighthq/signals/contract';
import { describe, expect, it } from 'vitest';

describe('nullSignalEmit', () => {
  it('does nothing', () => {
    nullSignalEmit();
  });
});
