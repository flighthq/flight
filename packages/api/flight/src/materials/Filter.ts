import { Filter as RawFilter } from '@flighthq/types';
import FlightObject from '../FlightObject';

export default class Filter extends FlightObject<RawFilter> {
  constructor() {
    super();
  }
}
