import { createToneMapEffect } from './toneMapEffect';

describe('createToneMapEffect', () => {
  it('tags the intent type and operator', () => {
    expect(createToneMapEffect({ operator: 'aces' })).toMatchObject({ kind: 'ToneMapEffect', operator: 'aces' });
  });
});
