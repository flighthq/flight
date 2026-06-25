import type { Signal, SignalData } from './Signal';

describe('Signal', () => {
  describe('Signal', () => {
    it('parameterizes emit by the slot function type', () => {
      type PointSlot = (x: number, y: number) => void;
      const signal: Signal<PointSlot> = {
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
      };
      const signal: Signal<Slot> = { data, emit: (_value) => {} };
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
      };

      expect(data.slots.length).toBe(2);
      expect(data.priorities).toEqual([10, 0]);
      expect(data.repeat).toEqual([true, false]);
      expect(data.cancelled).toBe(false);
    });

    it('types the slots array to the parameterized slot signature', () => {
      type Slot = (n: number) => void;
      const data: SignalData<Slot> = {
        slots: [],
        priorities: [],
        repeat: [],
        cancelled: false,
      };
      data.slots.push((n) => {
        void n;
      });
      expect(data.slots.length).toBe(1);
    });
  });
});
