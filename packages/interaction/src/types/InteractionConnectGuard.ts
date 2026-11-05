import type { NodeAny } from '@flighthq/node/contract';

import type { InteractionSignalName } from './InteractionManager.ts';

export type InteractionConnectGuard = (target: NodeAny, name: InteractionSignalName) => void;
