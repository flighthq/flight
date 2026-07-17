import type { Appearance3DNode, HasAppearance3D, HasAppearance3DRuntime } from './HasAppearance3D';
import type { SceneNode, SceneNodeTraits } from './SceneNode';

describe('HasAppearance3D', () => {
  it('carries a single alpha opacity field', () => {
    const appearance: HasAppearance3D = { alpha: 0.5 };
    expect(appearance.alpha).toBe(0.5);
  });

  it('is a trait of every SceneNode (SceneNodeTraits extends it)', () => {
    const traits: SceneNodeTraits = { alpha: 1, localMatrix: undefined as unknown as SceneNodeTraits['localMatrix'] };
    const appearance: HasAppearance3D = traits;
    expect(appearance.alpha).toBe(1);
  });

  it('pairs with a runtime tier holding the resolved worldAlpha (nullable render state)', () => {
    const runtime: Pick<HasAppearance3DRuntime, 'worldAlpha'> = { worldAlpha: null };
    runtime.worldAlpha = 0.25;
    expect(runtime.worldAlpha).toBe(0.25);
  });

  it('narrows an Appearance3DNode to its alpha', () => {
    const node = { alpha: 0.8 } as unknown as Appearance3DNode;
    const asScene: Pick<SceneNode, 'alpha'> = node;
    expect(asScene.alpha).toBeCloseTo(0.8);
  });
});
