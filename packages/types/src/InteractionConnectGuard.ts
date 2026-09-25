import type { InteractionSignalName } from './InteractionManager.ts';
import type { NodeAny } from './Node.ts';

export type InteractionConnectGuard = (target: NodeAny, name: InteractionSignalName) => void;
