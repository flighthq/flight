import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, HasShareContent, ShareContentBackend } from '@flighthq/types/contract';

import { shareText } from './share';

function createRecordingHost(label: string, calls: string[]): HasShareContent {
  const content = allocateEntity<any>();
  content.canShareContent = () => true;
  content.shareContent = async (payload) => {
    calls.push(`${label}:${payload.text ?? ''}`);
    return true;
  };
  content.shareContentWithResult = async () => {
    return { activityType: null, completed: true, dismissed: false };
  };
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
