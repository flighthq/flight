import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { HostShareContentProvider, ShareContent } from '@flighthq/types/contract';

import { shareText } from './share';

function createRecordingHost(
  label: string,
  calls: string[],
): { readonly share: { readonly content: HostShareContentProvider } } {
  const content = allocateEntity<HostShareContentProvider>();
  content.canShareContent = () => true;
  content.shareContent = async (payload: Readonly<ShareContent>) => {
    calls.push(`${label}:${payload.text ?? ''}`);
    return true;
  };
  content.shareContentWithResult = async () => {
    return { activityType: null, completed: true, dismissed: false };
  };
  return { share: { content: finishEntity(content) } };
}

describe('explicit Share host isolation', () => {
  it('routes two live hosts to their own content providers', async () => {
    const calls: string[] = [];
    const first = createRecordingHost('first', calls);
    const second = createRecordingHost('second', calls);

    expect(await shareText(first.share.content, 'alpha')).toBe(true);
    expect(await shareText(second.share.content, 'beta')).toBe(true);
    expect(calls).toEqual(['first:alpha', 'second:beta']);
  });
});
