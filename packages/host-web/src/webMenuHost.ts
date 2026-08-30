import { createHost } from '@flighthq/entity/contract';
import type { HasMenuHighlight, HasMenuPopup, Host } from '@flighthq/types/contract';

import { webMenuHighlightBackend, webMenuPopupBackend } from './webMenu';

export const webMenuHost: Host & HasMenuHighlight & HasMenuPopup = createHost({
  menu: { highlight: webMenuHighlightBackend, popup: webMenuPopupBackend },
});
