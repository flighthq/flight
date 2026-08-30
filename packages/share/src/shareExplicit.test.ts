import { createEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, HasShareContent, ShareContentBackend } from '@flighthq/types/contract';

import { shareText } from './share';

function createRecordingHost(label: string, calls: string[]): HasShareContent {
  const content = createEntity({
    canShareContent: () => true,
    async shareContent(payload) {
      calls.push(`${label}:${payload.text ?? ''}`);
      return true;
    },
    async shareContentWithResult() {
      return { activityType: null, completed: true, dismissed: false };
    },
  } satisfies Omit<ShareContentBackend, typeof EntityRuntimeKey>);
  return { share: { content } };
}

describe('explicit Share host isolation', () => {
  it('routes two live hosts to their own content providers', async () => {
    const calls: string[] = [];
    const first = createRecordingHost('first', calls);
    const second = createRecordingHost('second', calls);

    expect(await shareText(first, 'alpha')).toBe(true);
    expect(await shareText(second, 'beta')).toBe(true);
    expect(calls).toEqual(['first:alpha', 'second:beta']);
  });
});
