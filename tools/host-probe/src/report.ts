import { HostProbeProtocolVersion } from './contract.ts';
import type { HostProbeHost, HostProbeReport, HostProbeResult } from './contract.ts';

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
