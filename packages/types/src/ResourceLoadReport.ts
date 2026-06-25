export interface ResourceLoadReport {
  attempts: number;
  bytes: number;
  elapsedMs: number;
  group: string | undefined;
  key: string;
  status: ResourceLoadReportStatus;
}

export type ResourceLoadReportStatus = 'cancelled' | 'failed' | 'loaded' | 'skipped';
