import type { InteractionSignalName } from './InteractionManager';
import type { NodeAny } from './Node';

export type InteractionConnectGuard = (target: NodeAny, name: InteractionSignalName) => void;
