import type { SceneNode } from '@flighthq/types';

export type SceneNodeInternal<K extends symbol> = Omit<SceneNode<K>, 'children' | 'parent' | 'root'> & {
  children: SceneNode<K>[] | null;
  parent: SceneNode<K> | null;
  root: SceneNode<K> | null;
};
