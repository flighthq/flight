import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CAPTURE_PROTOCOL_VERSION } from './captureProtocol';
import { CAPTURE_REPORT_VERSION, writeCaptureReport } from './captureReport';

describe('writeCaptureReport', () => {
  it('writes a versioned machine envelope and returns the absolute path', () => {
    const root = mkdtempSync(join(tmpdir(), 'tool-capture-report-'));
    try {
      const path = writeCaptureReport(join(root, 'nested', 'report.json'), 'capture', { captured: 2 });
      const report = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      expect(report).toMatchObject({
        protocolVersion: CAPTURE_PROTOCOL_VERSION,
        reportVersion: CAPTURE_REPORT_VERSION,
        kind: 'capture',
        result: { captured: 2 },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
