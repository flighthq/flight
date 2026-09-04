import { describe, expect, it } from 'vitest';

import {
  createPhysics3DContact,
  createPhysics3DContactPoint,
  initializePhysics3DContact,
  initializePhysics3DContactPoint,
} from './contacts';

describe('createPhysics3DContact', () => {
  it('orders the pair by index whichever way round it is given', () => {
    // The order is an invariant of creation rather than a convention a caller is asked to respect: a
    // narrow phase ties its contact points toward its first argument, so the reversed pair would move the
    // points and renumber their feature ids — and the warm-start cache is keyed to those ids.
    expect(createPhysics3DContact(7, 3).bodyA).toBe(3);
    expect(createPhysics3DContact(7, 3).bodyB).toBe(7);
    expect(createPhysics3DContact(3, 7).bodyA).toBe(3);
  });

  it('starts inert, with no points and nothing touching', () => {
    const contact = createPhysics3DContact(0, 1);

    expect(contact.pointCount).toBe(0);
    expect(contact.points).toEqual([]);
    expect(contact.touching).toBe(false);
    expect([contact.normalX, contact.normalY, contact.normalZ]).toEqual([0, 0, 0]);
  });

  it('is enabled and solid by default', () => {
    const contact = createPhysics3DContact(0, 1);

    expect(contact.enabled).toBe(true);
    expect(contact.sensor).toBe(false);
    expect(contact.friction).toBe(0);
    expect(contact.restitution).toBe(0);
  });

  it('allocates a distinct record each time', () => {
    expect(createPhysics3DContact(0, 1).points).not.toBe(createPhysics3DContact(0, 1).points);
  });
});

describe('createPhysics3DContactPoint', () => {
  it('zeroes the geometry and both lever arms', () => {
    const point = createPhysics3DContactPoint();

    expect([point.x, point.y, point.z, point.depth, point.featureId]).toEqual([0, 0, 0, 0, 0]);
    expect([point.rAX, point.rAY, point.rAZ]).toEqual([0, 0, 0]);
    expect([point.rBX, point.rBY, point.rBZ]).toEqual([0, 0, 0]);
  });

  it('carries no solver state', () => {
    // Solver accumulators live in `Physics3DContactConstraintPoint`, which the solver owns. A contact
    // point carries geometry and identity only, so a second solver inherits no dead fields.
    expect(Object.keys(createPhysics3DContactPoint()).sort()).toEqual([
      'depth',
      'featureId',
      'rAX',
      'rAY',
      'rAZ',
      'rBX',
      'rBY',
      'rBZ',
      'x',
      'y',
      'z',
    ]);
  });
});
describe('initializePhysics3DContact', () => {
  it('is the construction initializer of createPhysics3DContact', () => {
    expect(typeof initializePhysics3DContact).toBe('function');
  });
});

describe('initializePhysics3DContactPoint', () => {
  it('is the construction initializer of createPhysics3DContactPoint', () => {
    expect(typeof initializePhysics3DContactPoint).toBe('function');
  });
});
