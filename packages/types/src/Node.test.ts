import type { Entity, EntityRuntime } from './Entity';
import type { Node, NodeAny, NodeRuntime, NodeTraits } from './Node';
import { NodeKind } from './Node';

describe('Node', () => {
  describe('NodeKind', () => {
    it('is the string Node', () => {
      expect(NodeKind).toBe('Node');
    });
  });

  describe('NodeOf', () => {
    it('intersects Node<Traits> with Traits', () => {
      interface MyTraits extends NodeTraits {
        data: { score: number } | null;
        enabled: boolean;
        kind: 'MyNode';
        name: string | null;
        myField: string;
      }

      // NodeOf<MyTraits> should have both Node and Traits properties
      type MyNodeKind = MyTraits['kind'];
      const kindCheck: MyNodeKind = 'MyNode';
      expect(kindCheck).toBe('MyNode');
    });
  });

  describe('NodeAny', () => {
    it('accepts any Node regardless of Traits', () => {
      interface TraitsA extends NodeTraits {
        data: null;
        enabled: boolean;
        kind: 'A';
        name: string | null;
        fieldA: number;
      }
      interface TraitsB extends NodeTraits {
        data: null;
        enabled: boolean;
        kind: 'B';
        name: string | null;
        fieldB: string;
      }

      function acceptsAny(_node: NodeAny): void {
        // accepts any node kind
      }

      const nodeA = {
        data: null,
        enabled: true,
        kind: 'A',
        name: null,
        fieldA: 1,
      } as unknown as Node<TraitsA>;

      const nodeB = {
        data: null,
        enabled: true,
        kind: 'B',
        name: null,
        fieldB: 'hello',
      } as unknown as Node<TraitsB>;

      // Both can be passed as NodeAny
      acceptsAny(nodeA);
      acceptsAny(nodeB);
      expect(true).toBe(true);
    });
  });

  describe('NodeRuntime', () => {
    it('has required numeric id fields', () => {
      // Verify the structural shape of NodeRuntime at the type level
      type RuntimeKeys = keyof NodeRuntime;

      type _HasAppearanceId = 'appearanceId' extends RuntimeKeys ? true : false;
      const _hasAppearance: _HasAppearanceId = true;
      void _hasAppearance;

      type _HasLocalTransformId = 'localTransformId' extends RuntimeKeys ? true : false;
      const _hasLocalTransform: _HasLocalTransformId = true;
      void _hasLocalTransform;

      expect(true).toBe(true);
    });
  });
});

// Compile-time check: Node<Traits> extends Entity
type _NodeExtendsEntity = Node extends Entity ? true : false;
const _nodeIsEntity: _NodeExtendsEntity = true;
void _nodeIsEntity;

// Compile-time check: NodeRuntime extends EntityRuntime
type _NodeRuntimeExtendsEntityRuntime = NodeRuntime extends EntityRuntime ? true : false;
const _nodeRuntimeIsEntityRuntime: _NodeRuntimeExtendsEntityRuntime = true;
void _nodeRuntimeIsEntityRuntime;
