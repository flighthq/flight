import { type DisplayObject, type DisplayObjectData, DisplayObjectKind, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './createPrimitive';

describe('createPrimitive', () => {
  it('allows creation of a type without a data field', () => {
    const displayObject = createPrimitive(DisplayObjectKind);
    expect(displayObject).not.toBeNull();
  });

  it('allows a custom type', () => {
    const data: PartialWithData<DisplayObjectTest> = {
      x: 100,
    };
    const displayObject = createPrimitive<DisplayObjectTest, DisplayObjectTestData>(DisplayObjectKind, data);
    expect(displayObject.x).toBe(data.x);
  });

  it('returns a new object', () => {
    const data: PartialWithData<DisplayObjectTest> = {};
    const displayObject = createPrimitive<DisplayObjectTest, DisplayObjectTestData>(DisplayObjectKind, data);
    expect(displayObject).not.toStrictEqual(data);
  });

  it('allows use of a data initializer', () => {
    const data: PartialWithData<DisplayObjectTest> = {};
    const displayObject = createPrimitive<DisplayObjectTest, DisplayObjectTestData>(
      DisplayObjectKind,
      data,
      createDisplayObjectTestData,
    );
    expect((displayObject.data as DisplayObjectTestData).foo).toBe('bar');
  });
});

interface DisplayObjectTest extends DisplayObject {}

interface DisplayObjectTestData extends DisplayObjectData {
  foo: string;
}

function createDisplayObjectTestData(data?: Partial<DisplayObjectTestData>): DisplayObjectTestData {
  return {
    foo: data?.foo ?? 'bar',
  };
}
