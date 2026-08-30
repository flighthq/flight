import { createHost } from '@flighthq/entity/contract';
import type { HasShareContent, HasShareFiles, Host } from '@flighthq/types/contract';

import { webShareContentBackend, webShareFilesBackend } from './webShare';

export const webShareHost: Host & HasShareContent & HasShareFiles = createHost({
  share: { content: webShareContentBackend, files: webShareFilesBackend },
});
