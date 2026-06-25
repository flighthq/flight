import type { MethodsOf } from './MethodsOf';

describe('MethodsOf', () => {
  it('extracts only method properties from an object type', () => {
    interface Widget {
      id: number;
      label: string;
      render(): void;
      update(delta: number): boolean;
    }

    type WidgetMethods = MethodsOf<Widget>;

    // Methods are preserved
    expectTypeOf<WidgetMethods>().toHaveProperty('render');
    expectTypeOf<WidgetMethods>().toHaveProperty('update');

    // Data properties are excluded
    // @ts-expect-error — 'id' is not in MethodsOf<Widget>
    type _HasId = WidgetMethods['id'];

    // @ts-expect-error — 'label' is not in MethodsOf<Widget>
    type _HasLabel = WidgetMethods['label'];
  });

  it('produces an empty type for objects with no methods', () => {
    interface DataOnly {
      x: number;
      y: number;
    }

    type DataMethods = MethodsOf<DataOnly>;

    // No keys expected — DataMethods should be an empty object type
    type Keys = keyof DataMethods;
    const _noKeys: Keys extends never ? true : false = true;
    void _noKeys;
  });

  it('preserves method signatures accurately', () => {
    interface Calculator {
      value: number;
      add(a: number, b: number): number;
      reset(): void;
    }

    type CalcMethods = MethodsOf<Calculator>;

    expectTypeOf<CalcMethods['add']>().toEqualTypeOf<(a: number, b: number) => number>();
    expectTypeOf<CalcMethods['reset']>().toEqualTypeOf<() => void>();
  });
});
