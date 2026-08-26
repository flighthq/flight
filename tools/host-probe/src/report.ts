import { HostProbeProtocolVersion } from './contract';
import type { HostProbeHost, HostProbeReport, HostProbeResult } from './contract';

export function createHostProbeReport(
  host: HostProbeHost,
  startedAt: Readonly<Date>,
  finishedAt: Readonly<Date>,
  results: HostProbeResult[],
): HostProbeReport {
  return {
    durationMilliseconds: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    finishedAt: finishedAt.toISOString(),
    host,
    protocolVersion: HostProbeProtocolVersion,
    results,
    startedAt: startedAt.toISOString(),
    status: results.some((result) => result.status === 'fail') ? 'fail' : 'pass',
  };
}
