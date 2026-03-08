import type { SceneNode } from '../../scene/graph/core/SceneNode';
import type { DisplayObjectKind } from '../../scene/graph/display/DisplayObject';
import type { SpriteKind } from '../../scene/graph/sprite/Sprite';

export type Renderable = SceneNode<typeof DisplayObjectKind> | SceneNode<typeof SpriteKind>;
