import type { FlightDocumentFields } from './FlightDocumentFieldSchema';
import type {
  FlightDocumentLayoutBinding,
  FlightDocumentLayoutDescriptor,
  FlightDocumentLayoutNode,
  FlightDocumentLayoutTree,
} from './FlightDocumentLayout';
import type { LayoutNode, LayoutTree } from './Layout';
import type { NodeAny } from './Node';

describe('FlightDocumentLayout', () => {
  it('specializes the existing LayoutTree vocabulary to document-safe fields', () => {
    expectTypeOf<FlightDocumentLayoutNode>().toEqualTypeOf<LayoutNode<FlightDocumentFields, FlightDocumentFields>>();
    expectTypeOf<FlightDocumentLayoutTree>().toExtend<LayoutTree>();
    expectTypeOf<keyof FlightDocumentLayoutTree>().toEqualTypeOf<'nodes'>();
  });

  it('pairs stable authored target names with layout nodes index-for-index', () => {
    expectTypeOf<keyof FlightDocumentLayoutDescriptor>().toEqualTypeOf<'targets' | 'tree'>();
    expectTypeOf<FlightDocumentLayoutDescriptor['targets']>().toEqualTypeOf<string[]>();
    expectTypeOf<FlightDocumentLayoutDescriptor['tree']>().toEqualTypeOf<FlightDocumentLayoutTree>();
  });

  it('materializes the same tree beside inert live-node targets', () => {
    expectTypeOf<keyof FlightDocumentLayoutBinding>().toEqualTypeOf<'targets' | 'tree'>();
    expectTypeOf<FlightDocumentLayoutBinding['targets']>().toEqualTypeOf<NodeAny[]>();
    expectTypeOf<FlightDocumentLayoutBinding['tree']>().toEqualTypeOf<FlightDocumentLayoutTree>();
  });
});
