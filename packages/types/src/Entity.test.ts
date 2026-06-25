import type { Entity, EntityRuntime, EntityWithoutRuntime, Kind } from './Entity';
import { EntityRuntimeKey } from './Entity';

describe('Entity', () => {
  describe('EntityRuntimeKey', () => {
    it('is a symbol', () => {
      expect(typeof EntityRuntimeKey).toBe('symbol');
    });

    it('is registered as Symbol.for("EntityRuntime")', () => {
      expect(EntityRuntimeKey).toBe(Symbol.for('EntityRuntime'));
    });
  });

  describe('EntityWithoutRuntime', () => {
    it('strips the runtime key from the entity type', () => {
      type TestRuntime = EntityRuntime & { testField: string };
      interface TestEntity extends Entity {
        [EntityRuntimeKey]: TestRuntime | undefined;
        value: number;
        name: string;
      }

      type Stripped = EntityWithoutRuntime<TestEntity>;

      // Verify Stripped has the plain data fields
      expectTypeOf<Stripped>().toHaveProperty('value');
      expectTypeOf<Stripped>().toHaveProperty('name');

      // Verify the runtime symbol key is not present
      // @ts-expect-error — EntityRuntimeKey should not exist on the stripped type
      type _HasRuntimeKey = Stripped[typeof EntityRuntimeKey];
    });

    it('produces a type assignable from a plain object literal', () => {
      interface TestEntity extends Entity {
        [EntityRuntimeKey]: EntityRuntime | undefined;
        count: number;
      }

      type Stripped = EntityWithoutRuntime<TestEntity>;

      const literal: Stripped = { count: 42 };
      expect(literal.count).toBe(42);
    });

    it('round-trips structurally — the entity without runtime is assignable to Stripped', () => {
      interface TestEntity extends Entity {
        [EntityRuntimeKey]: EntityRuntime | undefined;
        label: string;
      }

      type Stripped = EntityWithoutRuntime<TestEntity>;
      const obj: TestEntity = { [EntityRuntimeKey]: undefined, label: 'hello' };
      const stripped: Stripped = obj;
      expect(stripped.label).toBe('hello');
    });
  });

  describe('Kind', () => {
    it('is assignable from a plain string', () => {
      const kind: Kind = 'MyKind';
      expect(typeof kind).toBe('string');
    });
  });
});
