import type { HostProbeResult } from './contract';
import { createHostProbeReport } from './report';

describe('createHostProbeReport', () => {
  it('passes unsupported and manual results', () => {
    const results: HostProbeResult[] = [
      { detail: 'not offered', id: 'provider.tray', kind: 'provider', status: 'unsupported' },
      { detail: 'needs permission', id: 'runtime.notification', kind: 'runtime', status: 'manual' },
    ];
    const report = createHostProbeReport('web', new Date(100), new Date(125), results);
    expect(report.status).toBe('pass');
    expect(report.durationMilliseconds).toBe(25);
  });

  it('fails when one result fails', () => {
    const results: HostProbeResult[] = [{ detail: 'missing', id: 'provider.loop', kind: 'provider', status: 'fail' }];
    expect(createHostProbeReport('web', new Date(100), new Date(90), results)).toMatchObject({
      durationMilliseconds: 0,
      status: 'fail',
    });
  });
});
