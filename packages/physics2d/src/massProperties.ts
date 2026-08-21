import type { Physics2DCollider, Physics2DMassData, RigidBody2D } from '@flighthq/types/contract';

// Mass properties are DERIVED from collider geometry and density, never assigned. A body whose mass
// was set independently of its shape can be given a rotational inertia that contradicts its outline —
// a long plank that spins like a marble — and nothing in the solver can detect the inconsistency,
// because both numbers are individually plausible. Deriving both from one source makes that
// unrepresentable.

// Writes `collider`'s mass, rotational inertia, and centroid into `out`, in the body's local space.
//
// The inertia is about the collider's OWN centroid, not the body origin; combining colliders shifts it
// with the parallel-axis theorem. Area-less shapes (segment, point) and unrecognised kinds carry no
// mass: they are legitimate as sensors and triggers, so they zero the entry rather than faulting.
export function computePhysics2DColliderMassData(collider: Readonly<Physics2DCollider>, out: Physics2DMassData): void {
  const shape = collider.local;
  const density = collider.material.density;
  switch (shape.kind) {
    case 'circle': {
      const area = Math.PI * shape.radius * shape.radius;
      out.mass = area * density;
      // A disc's second moment about its centre: ½·m·r².
      out.inertia = 0.5 * out.mass * shape.radius * shape.radius;
      out.centerX = shape.x;
      out.centerY = shape.y;
      return;
    }
    case 'capsule': {
      // A stadium: a rectangle `length` by `2r`, plus the two half-discs at its ends, which together are
      // exactly one disc of radius `r`.
      //
      // The inertia is NOT the rectangle's plus a disc's about the centre. Each half-disc sits at the end
      // of the axis, and its own centroid is a further `4r/(3*pi)` outboard of the circle centre it is
      // drawn about — so shifting its moment to the capsule's centre leaves a cross term `2*d*m*4r/(3pi)`
      // that a naive parallel-axis step drops. Dropping it under-reports a long thin capsule's inertia,
      // which reads as a capsule that spins up too easily and never looks obviously wrong.
      const axisX = shape.x1 - shape.x0;
      const axisY = shape.y1 - shape.y0;
      const length = Math.sqrt(axisX * axisX + axisY * axisY);
      const radius = shape.radius;
      const rectangleMass = 2 * radius * length * density;
      const discMass = Math.PI * radius * radius * density;
      out.mass = rectangleMass + discMass;
      out.inertia =
        (rectangleMass * (length * length + 4 * radius * radius)) / 12 +
        discMass * ((radius * radius) / 2 + (length * length) / 4 + (4 * radius * length) / (3 * Math.PI));
      // The axis midpoint, which is the centroid by symmetry about both the axis and its perpendicular
      // bisector.
      out.centerX = (shape.x0 + shape.x1) / 2;
      out.centerY = (shape.y0 + shape.y1) / 2;
      return;
    }
    case 'aabb': {
      const width = shape.maxX - shape.minX;
      const height = shape.maxY - shape.minY;
      out.mass = width * height * density;
      out.inertia = (out.mass * (width * width + height * height)) / 12;
      out.centerX = (shape.minX + shape.maxX) / 2;
      out.centerY = (shape.minY + shape.maxY) / 2;
      return;
    }
    case 'obb': {
      const width = shape.halfW * 2;
      const height = shape.halfH * 2;
      out.mass = width * height * density;
      // Rotation about the z axis does not change a rectangle's second moment about its own centre,
      // so an oriented box uses the same expression as an axis-aligned one.
      out.inertia = (out.mass * (width * width + height * height)) / 12;
      out.centerX = shape.x;
      out.centerY = shape.y;
      return;
    }
    case 'polygon':
      writePolygonMassData(shape.points, density, out);
      return;
    default:
      out.mass = 0;
      out.inertia = 0;
      out.centerX = 0;
      out.centerY = 0;
  }
}

// Recomputes `body`'s mass, rotational inertia, centre of mass, and the inverses the solver divides
// by, from its colliders. Call after adding, removing, or reshaping a collider, or after changing a
// material's density.
//
// Static and kinematic bodies keep their computed centre — the lever arms in a contact are measured
// from it either way — but take zero inverse mass and inverse inertia. Zero is not a guard here, it is
// the arithmetic: an impulse scaled by an inverse mass of zero moves the body not at all, so
// "infinite mass" needs no branch anywhere in the solver. A dynamic body with no area gets the same
// treatment, since dividing by its zero mass is what would otherwise produce NaN velocities that
// spread to everything it touches.
export function updateRigidBody2DMassData(body: RigidBody2D): void {
  const scratch = acquirePhysics2DMassScratch();
  try {
    updateRigidBody2DMassDataWithScratch(body, scratch);
  } finally {
    releasePhysics2DMassScratch(scratch);
  }
}

function updateRigidBody2DMassDataWithScratch(body: RigidBody2D, scratch: Physics2DMassData): void {
  let mass = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (const collider of body.colliders) {
    computePhysics2DColliderMassData(collider, scratch);
    mass += scratch.mass;
    weightedX += scratch.centerX * scratch.mass;
    weightedY += scratch.centerY * scratch.mass;
  }

  if (mass > 0) {
    body.centerX = weightedX / mass;
    body.centerY = weightedY / mass;
  } else {
    body.centerX = 0;
    body.centerY = 0;
  }

  // Second pass: each collider's inertia is about its own centroid, so shift every one to the body's
  // combined centre before summing (parallel-axis theorem). This cannot fold into the loop above,
  // because the centre it shifts to is not known until every collider has been weighed.
  let inertia = 0;
  for (const collider of body.colliders) {
    computePhysics2DColliderMassData(collider, scratch);
    const offsetX = scratch.centerX - body.centerX;
    const offsetY = scratch.centerY - body.centerY;
    inertia += scratch.inertia + scratch.mass * (offsetX * offsetX + offsetY * offsetY);
  }

  const simulated = body.type === 'dynamic';
  body.mass = simulated ? mass : 0;
  body.inertia = simulated ? inertia : 0;
  body.inverseMass = simulated && mass > 0 ? 1 / mass : 0;
  body.inverseInertia = simulated && !body.fixedRotation && inertia > 0 ? 1 / inertia : 0;
}

// Centroid and second moment of a simple polygon, accumulated per triangle fanned from the origin.
// Each triangle's signed area weights its contribution, so the winding cancels correctly on concave
// spans and the total comes out positive for either winding direction.
function writePolygonMassData(points: readonly number[], density: number, out: Physics2DMassData): void {
  const count = points.length >> 1;
  if (count < 3) {
    out.mass = 0;
    out.inertia = 0;
    out.centerX = 0;
    out.centerY = 0;
    return;
  }

  let area = 0;
  let centroidX = 0;
  let centroidY = 0;
  let moment = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const x0 = points[i * 2];
    const y0 = points[i * 2 + 1];
    const x1 = points[j * 2];
    const y1 = points[j * 2 + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    centroidX += (x0 + x1) * cross;
    centroidY += (y0 + y1) * cross;
    moment += cross * (x0 * x0 + x0 * x1 + x1 * x1 + y0 * y0 + y0 * y1 + y1 * y1);
  }

  area *= 0.5;
  // A zero-area polygon — every vertex collinear or coincident — would divide the centroid by zero.
  // It is degenerate rather than malformed, so it weighs nothing, exactly like a segment.
  if (area === 0) {
    out.mass = 0;
    out.inertia = 0;
    out.centerX = 0;
    out.centerY = 0;
    return;
  }

  const absoluteArea = Math.abs(area);
  out.mass = absoluteArea * density;
  out.centerX = centroidX / (6 * area);
  out.centerY = centroidY / (6 * area);
  // Shift the origin-relative second moment onto the centroid.
  const originMoment = (Math.abs(moment) / 12) * density;
  const offsetSquared = out.centerX * out.centerX + out.centerY * out.centerY;
  out.inertia = originMoment - out.mass * offsetSquared;
}

function acquirePhysics2DMassScratch(): Physics2DMassData {
  return physics2DMassScratchPool.pop() ?? { mass: 0, inertia: 0, centerX: 0, centerY: 0 };
}

function releasePhysics2DMassScratch(scratch: Physics2DMassData): void {
  physics2DMassScratchPool.push(scratch);
}

const physics2DMassScratchPool: Physics2DMassData[] = [{ mass: 0, inertia: 0, centerX: 0, centerY: 0 }];
