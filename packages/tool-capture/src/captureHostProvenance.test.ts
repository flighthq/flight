import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCaptureHostProvenance } from './captureHostProvenance';

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('getCaptureHostProvenance', () => {
  it('keeps the comparable environment separate from the differing host instance', () => {
    const common = {
      FLIGHT_CAPTURE_ENVIRONMENT_DESCRIPTOR: 'runner=ubuntu24;image=20260801;Playwright1.61;viewport=default',
      FLIGHT_CAPTURE_ENVIRONMENT_ID: 'sha256-environment',
    };
    const first = getCaptureHostProvenance({ ...common, FLIGHT_CAPTURE_HOST_ID: 'run-7-leg-1' }, 'same-image');
    const second = getCaptureHostProvenance({ ...common, FLIGHT_CAPTURE_HOST_ID: 'run-7-leg-2' }, 'same-image');

    expect(first.environmentId).toBe(second.environmentId);
    expect(first.environmentDescriptor).toBe(second.environmentDescriptor);
    expect(first.hostInstanceId).not.toBe(second.hostInstanceId);
  });

  it('lets an explicit host instance win over every fallback', () => {
    expect(
      getCaptureHostProvenance(
        {
          FLIGHT_CAPTURE_HOST_ID: 'declared-host',
          FLIGHT_CAPTURE_MATRIX_LEG: '2',
          GITHUB_RUN_ATTEMPT: '3',
          GITHUB_RUN_ID: '41',
        },
        'machine-hostname',
      ).hostInstanceId,
    ).toBe('declared-host');
  });

  it('derives a GitHub matrix host only when the run and leg are both available', () => {
    expect(
      getCaptureHostProvenance(
        { FLIGHT_CAPTURE_MATRIX_LEG: '2', GITHUB_RUN_ATTEMPT: '3', GITHUB_RUN_ID: '41' },
        'machine-hostname',
      ).hostInstanceId,
    ).toBe('41-3-leg-2');
    expect(getCaptureHostProvenance({ GITHUB_RUN_ID: '41' }, 'machine-hostname').hostInstanceId).toBe(
      'machine-hostname',
    );
  });

  it('uses the local hostname without manufacturing absent environment evidence', () => {
    expect(getCaptureHostProvenance({}, 'local-machine')).toEqual({
      environmentDescriptor: null,
      environmentId: null,
      hostInstanceId: 'local-machine',
    });
  });

  it('pins the calibration workflow to distinct host and shared environment evidence', () => {
    const workflow = readFileSync(join(REPOSITORY_ROOT, '.github/workflows/reference-image-calibrate.yml'), 'utf8');
    expect(workflow).toContain(
      'FLIGHT_CAPTURE_HOST_ID: ${{ github.run_id }}-${{ github.run_attempt }}-leg-${{ matrix.host }}',
    );
    expect(workflow).toContain('FLIGHT_CAPTURE_ENVIRONMENT_ID: ${{ steps.environment.outputs.id }}');
    expect(workflow).toContain('FLIGHT_CAPTURE_ENVIRONMENT_DESCRIPTOR: ${{ steps.environment.outputs.descriptor }}');
  });
});
