import type { GraphNode } from '@flighthq/types';

export type GraphNodeInternal<K extends symbol> = Omit<GraphNode<K>, 'children' | 'parent'> & {
  children: GraphNode<K>[] | null;
  parent: GraphNode<K> | null;
};
