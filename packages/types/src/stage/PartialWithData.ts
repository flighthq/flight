export type PartialWithData<T> = {
  data?: Partial<T extends { data: infer U } ? U : never>;
} & Partial<Omit<T, 'data'>>;

export default PartialWithData;
