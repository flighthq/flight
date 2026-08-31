import type { Plugin } from 'vite';

import { parseReviewManifest } from './reviewManifest';
import type { ReviewTest } from './reviewManifest';

export const REVIEW_MANIFEST_PUBLIC_ID = 'virtual:review-manifest';
export const REVIEW_MANIFEST_RESOLVED_ID = '\0virtual:review-manifest';

export interface ReviewManifestPlugin extends Plugin {
  load(id: string): string | undefined;
  resolveId(source: string): string | undefined;
}

export function createReviewManifestPlugin(discover: () => ReviewTest[]): ReviewManifestPlugin {
  return {
    name: 'review:manifest',
    resolveId(source) {
      if (source === REVIEW_MANIFEST_PUBLIC_ID) return REVIEW_MANIFEST_RESOLVED_ID;
    },
    load(id) {
      if (id !== REVIEW_MANIFEST_RESOLVED_ID) return;
      const payload = JSON.stringify(parseReviewManifest(discover()));
      return `import { parseReviewManifest } from '/src/reviewManifest.ts';\nexport const tests = parseReviewManifest(${payload});`;
    },
  };
}
