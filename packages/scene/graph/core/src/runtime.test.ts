import type { SceneNode, SceneNodeRuntime } from '@flighthq/types';
import { SceneNodeKind } from '@flighthq/types';

import {
  createSceneNodeRuntime,
  defaultSceneNodeRuntimeCallback,
  defaultSceneNodeRuntimeCanAddChild,
  getRuntime,
} from './runtime';
import { createSceneNode } from './sceneNode';

describe('createSceneNodeRuntime', () => {
  let runtime: SceneNodeRuntime<typeof SceneNodeKind>;

  beforeEach(() => {
    runtime = createSceneNodeRuntime(SceneNodeKind);
  });

  it('initializes default values', () => {
    expect(runtime.appearanceID).toStrictEqual(0);
    expect(runtime.canAddChild).toStrictEqual(defaultSceneNodeRuntimeCanAddChild);
    expect(runtime.localTransformID).toStrictEqual(0);
    expect(runtime.onChildrenChanged).toStrictEqual(defaultSceneNodeRuntimeCallback);
    expect(runtime.onParentChanged).toStrictEqual(defaultSceneNodeRuntimeCallback);
  });

  it('allows pre-defined methods', () => {
    const base = {
      canAddChild: (_parent: SceneNode<typeof SceneNodeKind>, _child: SceneNode<typeof SceneNodeKind>) => {
        return false;
      },
      onChildrenChanged: (_source: SceneNode<typeof SceneNodeKind>) => {},
      onParentChanged: (_source: SceneNode<typeof SceneNodeKind>) => {},
    };
    const obj = createSceneNodeRuntime(SceneNodeKind, base);
    expect(obj.canAddChild).toStrictEqual(base.canAddChild);
    expect(obj.onChildrenChanged).toStrictEqual(base.onChildrenChanged);
    expect(obj.onParentChanged).toStrictEqual(base.onParentChanged);
  });

  it('ignores other incoming values', () => {
    const base = {
      appearanceID: 100,
      localTransformID: 200,
    };
    const obj = createSceneNodeRuntime(SceneNodeKind, base);
    expect(obj.appearanceID).not.toEqual(base.appearanceID);
    expect(obj.localTransformID).not.toEqual(base.localTransformID);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSceneNodeRuntime(SceneNodeKind, base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('getRuntime', () => {
  it('assumes runtime is defined', () => {
    const source: SceneNode<typeof SceneNodeKind> = { parent: null, children: [] } as unknown as SceneNode<
      typeof SceneNodeKind
    >;
    const state = getRuntime(source);
    expect(state).toBeUndefined();
  });

  it('returns state when defined', () => {
    const source = createSceneNode(SceneNodeKind);
    const state = getRuntime(source);
    expect(state).not.toBeUndefined();
  });
});
