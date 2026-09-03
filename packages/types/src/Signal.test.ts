import { EntityRuntimeKey } from './Entity';
import type { Signal, SignalData } from './Signal';

describe('Signal', () => {
  describe('Signal', () => {
    it('parameterizes emit by the slot function type', () => {
      type PointSlot = (x: number, y: number) => void;
      // types has no dependency to reach createEntity with, so the runtime slot is written literally.
      // This is a type-shape test, not construction of an SDK object.
      const signal: Signal<PointSlot> = {
        [EntityRuntimeKey]: undefined,
        data: null,
        emit: (_x, _y) => {},
      };

      // emit accepts exactly the slot signature
      signal.emit(1, 2);
      expect(signal.data).toBeNull();
    });

    it('carries a nullable SignalData payload', () => {
      type Slot = (value: string) => void;
      const data: SignalData<Slot> = {
        slots: [(_value) => {}],
        priorities: [0],
        repeat: [true],
        cancelled: false,
        depth: 0,
      };
      const signal: Signal<Slot> = { [EntityRuntimeKey]: undefined, data, emit: (_value) => {} };
      expect(signal.data?.slots.length).toBe(1);
    });
  });

  describe('SignalData', () => {
    it('carries parallel slot, priority, and repeat arrays plus a cancelled flag', () => {
      type Slot = () => void;
      const data: SignalData<Slot> = {
        slots: [() => {}, () => {}],
        priorities: [10, 0],
        repeat: [true, false],
        cancelled: false,
        depth: 0,
      };

      expect(data.slots.length).toBe(2);
      expect(data.priorities).toEqual([10, 0]);
      expect(data.repeat).toEqual([true, false]);
      expect(data.cancelled).toBe(false);
      expect(data.depth).toBe(0);
    });

    it('admits a null slot as the tombstone for a removed entry', () => {
      type Slot = () => void;
      const data: SignalData<Slot> = {
        slots: [() => {}, null],
        priorities: [0, 0],
        repeat: [true, true],
        cancelled: false,
        depth: 1,
      };

      // The dead entry keeps its priority and repeat cells so no index moves while a dispatch holds
      // a cursor into these arrays.
      expect(data.slots[1]).toBeNull();
      expect(data.priorities).toHaveLength(2);
      expect(data.repeat).toHaveLength(2);
    });

    it('types the slots array to the parameterized slot signature', () => {
      type Slot = (n: number) => void;
      const data: SignalData<Slot> = {
        slots: [],
        priorities: [],
        repeat: [],
        cancelled: false,
        depth: 0,
      };
      data.slots.push((n) => {
        void n;
      });
      expect(data.slots.length).toBe(1);
    });
  });
});
