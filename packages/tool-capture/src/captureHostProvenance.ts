import { hostname } from 'node:os';

export interface CaptureHostProvenance {
  /** One execution host instance. Equal within one artifact root; distinct across independent roots. */
  hostInstanceId: string | null;
  /** Declared capture environment identity. Independent roots are comparable only when this matches. */
  environmentId: string | null;
  /** Human-readable evidence the environment identity was derived from. */
  environmentDescriptor: string | null;
}

/** Resolves the host-instance and declared-environment identities recorded in every capture status. */
export function getCaptureHostProvenance(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  machineHostname: string = hostname(),
): CaptureHostProvenance {
  const githubRunId = nonEmpty(environment['GITHUB_RUN_ID']);
  const githubMatrixLeg = nonEmpty(environment['FLIGHT_CAPTURE_MATRIX_LEG']);
  const githubHostInstance =
    githubRunId !== null && githubMatrixLeg !== null
      ? `${githubRunId}-${nonEmpty(environment['GITHUB_RUN_ATTEMPT']) ?? '1'}-leg-${githubMatrixLeg}`
      : null;
  return {
    // The declared environment describes what MUST MATCH; it can never identify the host that MUST
    // DIFFER. The workflow sets the explicit host ID because hosted-runner names are not reliably unique.
    hostInstanceId:
      nonEmpty(environment['FLIGHT_CAPTURE_HOST_ID']) ??
      githubHostInstance ??
      nonEmpty(environment['CI_RUNNER_ID']) ??
      nonEmpty(environment['BUILDKITE_AGENT_ID']) ??
      nonEmpty(machineHostname),
    environmentId: nonEmpty(environment['FLIGHT_CAPTURE_ENVIRONMENT_ID']),
    environmentDescriptor: nonEmpty(environment['FLIGHT_CAPTURE_ENVIRONMENT_DESCRIPTOR']),
  };
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}
