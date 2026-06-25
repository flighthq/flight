import type { PartialNode } from './PartialNode';

describe('PartialNode', () => {
  it('makes data fields partial within the data object', () => {
    interface MyData {
      x: number;
      y: number;
      label: string;
    }
    interface MyNode {
      data: MyData;
      kind: string;
      name: string | null;
    }

    type Partial_ = PartialNode<MyNode>;

    // data is optional and its inner fields are also partial
    const withPartialData: Partial_ = { data: { x: 1 } };
    expect(withPartialData.data?.x).toBe(1);
    expect(withPartialData.data?.y).toBeUndefined();
  });

  it('makes top-level non-data fields optional', () => {
    interface MyNode {
      data: { count: number };
      kind: string;
      name: string | null;
    }

    type Partial_ = PartialNode<MyNode>;

    // All top-level fields are optional (Partial applied to Omit<T, 'data'>)
    const empty: Partial_ = {};
    expect(empty.kind).toBeUndefined();
    expect(empty.name).toBeUndefined();
  });

  it('accepts a fully specified node', () => {
    interface MyNode {
      data: { value: number };
      kind: string;
      enabled: boolean;
    }

    type Partial_ = PartialNode<MyNode>;

    const full: Partial_ = { data: { value: 42 }, kind: 'MyNode', enabled: true };
    expect(full.data?.value).toBe(42);
    expect(full.kind).toBe('MyNode');
    expect(full.enabled).toBe(true);
  });

  it('handles nodes with null data gracefully', () => {
    interface MyNode {
      data: null;
      kind: string;
    }

    type Partial_ = PartialNode<MyNode>;

    // data?: Partial<never> | undefined = data?: undefined
    const minimal: Partial_ = {};
    expect(minimal.data).toBeUndefined();
  });
});
