import { createHost } from '@flighthq/entity/contract';

import { webMediaSessionActionBackend, webMediaSessionBackend } from './webMediasession';

export const webMediaHost = createHost({
  media: {
    session: webMediaSessionBackend,
    sessionAction: webMediaSessionActionBackend,
  },
});
