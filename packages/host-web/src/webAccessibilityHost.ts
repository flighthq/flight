import { createHost } from '@flighthq/entity/contract';
import type { HasAccessibilityProvider, Host } from '@flighthq/types/contract';

import { webAccessibilityBackend } from './webAccessibility';

export const webAccessibilityHost: Host & HasAccessibilityProvider = createHost({
  accessibility: { provider: webAccessibilityBackend },
});
