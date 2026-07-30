declare module 'virtual:functional-test-list' {
  export const tests: readonly Readonly<{
    name: string;
    renderers: readonly string[];
  }>[];
}
