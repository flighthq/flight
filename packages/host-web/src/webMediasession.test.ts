import {
  destroyMediaSessionBackend,
  explainMediaSessionOperation,
  getMediaSessionBackend,
  resetMediaSessionBackendForTest,
} from '@flighthq/mediasession/contract';

import { enableHostWebMediaSession, resetHostWebMediasessionForTest } from './webMediasession';

describe('enableHostWebMediaSession', () => {
  afterEach(() => resetHostWebMediasessionForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebMediaSession()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebMediaSession();
    expect(() => enableHostWebMediaSession()).not.toThrow();
  });
});

// ★ RE-ENABLE AFTER TEARDOWN, asserted by LAYER because `MediaSession` publishes an `explain*Operation`
// seam that names which slot answers. Before the latch was derived, the second
// `enableHostWebMediaSession()` returned without installing — the host-local `_enabled` still said
// "installed" while `destroyMediaSessionBackend` had emptied the slot — so the capability answered from
// its sentinel permanently. The middle assertion pins the state that made it invisible.
describe('enableHostWebMediaSession after teardown', () => {
  afterEach(() => resetMediaSessionBackendForTest());

  it('reinstalls the host backend instead of leaving the capability on its sentinel', () => {
    resetMediaSessionBackendForTest();
    enableHostWebMediaSession();
    expect(explainMediaSessionOperation('setPlaybackState').layer).toBe('host');

    destroyMediaSessionBackend();
    expect(explainMediaSessionOperation('setPlaybackState').layer).toBe('sentinel');

    enableHostWebMediaSession();
    expect(explainMediaSessionOperation('setPlaybackState').layer).toBe('host');
  });

  it('stays idempotent while the host slot is occupied', () => {
    resetMediaSessionBackendForTest();
    enableHostWebMediaSession();
    const installed = getMediaSessionBackend();
    enableHostWebMediaSession();
    expect(getMediaSessionBackend()).toBe(installed);
  });
});

describe('resetHostWebMediasessionForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebMediaSession();
    resetHostWebMediasessionForTest();
    expect(() => enableHostWebMediaSession()).not.toThrow();
  });
});
