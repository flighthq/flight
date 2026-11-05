export type PartialNode<T> = {
  data?: Partial<T extends { data: infer U } ? U : never>;
} & Partial<Omit<T, 'data'>>;
