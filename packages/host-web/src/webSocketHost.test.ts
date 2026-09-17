import type { HostSocketCapabilities } from '@flighthq/types/contract';

import { webHostSocket } from './webSocket';
import { webHostSocketGroup } from './webSocketHost';

describe('webHostSocketGroup', () => {
  it('publishes the socket leaf under the group slot that scopes it', () => {
    const group: HostSocketCapabilities = webHostSocketGroup;

    expect(group).toBe(webHostSocketGroup);
    expect(webHostSocketGroup).not.toBe(webHostSocket);
    expect(webHostSocketGroup.connection).toBe(webHostSocket);
    expect(Object.keys(webHostSocketGroup)).toEqual(['connection']);
  });

  it('exports only the direct group value', async () => {
    const source = await import('./webSocketHost');
    expect(Object.keys(source)).toEqual(['webHostSocketGroup']);
  });
});
