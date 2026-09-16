import type { HostNetCapabilities } from '@flighthq/types/contract';

import { webHostNet } from './webNet';
import { webHostNetGroup } from './webNetHost';
import { webHostSocket } from './webSocket';

describe('webHostNetGroup', () => {
  it('uses the narrow collision escape while the explicit leaf keeps webHostNet', () => {
    const group: HostNetCapabilities = webHostNetGroup;

    expect(group).toBe(webHostNetGroup);
    expect(webHostNetGroup).not.toBe(webHostNet);
    expect(webHostNetGroup.http).toBe(webHostNet);
    expect(webHostNetGroup.socket).toBe(webHostSocket);
    expect(Object.keys(webHostNetGroup).sort()).toEqual(['http', 'socket']);
  });

  it('exports only the direct group value', async () => {
    const source = await import('./webNetHost');
    expect(Object.keys(source)).toEqual(['webHostNetGroup']);
  });
});
