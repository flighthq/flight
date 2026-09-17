import type { HostNetCapabilities } from '@flighthq/types/contract';

import { webHostNet } from './webNet';
import { webHostNetGroup } from './webNetHost';

describe('webHostNetGroup', () => {
  it('uses the narrow collision escape while the explicit leaf keeps webHostNet', () => {
    const group: HostNetCapabilities = webHostNetGroup;

    expect(group).toBe(webHostNetGroup);
    expect(webHostNetGroup).not.toBe(webHostNet);
    expect(webHostNetGroup.http).toBe(webHostNet);
    expect(Object.keys(webHostNetGroup)).toEqual(['http']);
  });

  it('exports only the direct group value', async () => {
    const source = await import('./webNetHost');
    expect(Object.keys(source)).toEqual(['webHostNetGroup']);
  });
});
