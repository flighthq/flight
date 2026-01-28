export default class BitmapFilter {
  constructor() {}

  static clone(source: BitmapFilter): BitmapFilter {
    // set invalidation on filter when cloning
    return new BitmapFilter();
  }
}
