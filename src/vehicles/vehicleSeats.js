import { Vector3 } from 'three';

const specialVehicles = {
  2: { vehicleId: 'parked-golf-red', displayName: 'Golf VI · красный', anchorY: -.28, frontX: -.25, rearX: -.85 },
  5: { vehicleId: 'parked-golf-player', displayName: 'Golf VI · серебристый', anchorY: .05 },
  16: { vehicleId: 'parked-mercedes-gl', displayName: 'Mercedes GL', anchorY: .15, frontX: -.25, rearX: -.85 },
  17: { vehicleId: 'parked-lexus-rx', displayName: 'Lexus RX', anchorY: -.02, frontX: -.25, rearX: -.85 },
  18: { vehicleId: 'parked-mercedes-gla-x156', displayName: 'Mercedes-Benz GLA X156', anchorY: -.20, frontX: -.15, rearX: -.88 },
};

// Root-local coordinates only: the vehicle nose is +X, left doors are -Z.
// The compact seated pose keeps its pelvis .72 m above the root anchor.
// Calibrated anchor heights keep heads below each cabin roof; GLB hierarchy
// and mesh names are never used to locate seats.
const seatDefinitions = [
  { seatId: 'driver', role: 'driver', side: -1, front: true },
  { seatId: 'front-passenger', role: 'passenger', side: 1, front: true },
  { seatId: 'rear-left', role: 'passenger', side: -1, front: false },
  { seatId: 'rear-right', role: 'passenger', side: 1, front: false },
];

function halfExtent(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Stable parking-slot identities and mesh-independent, four-seat metadata.
 * GLB loaders replace visual children, leaving the car root and its ID intact.
 * Claim/release is synchronous locally; future network ownership can wrap it.
 */
export function createVehicleRegistry(parked) {
  const byId = new Map();
  const vehicles = parked.map((car, index) => {
    const definition = specialVehicles[index];
    const vehicleId = car.userData.vehicleId ?? definition?.vehicleId ?? `parked-${String(index).padStart(2, '0')}`;
    if (byId.has(vehicleId)) throw new Error(`Duplicate vehicleId: ${vehicleId}`);
    car.userData.vehicleId = vehicleId;
    const vehicle = {
      vehicleId,
      car,
      index,
      canDrive: true,
      displayName: definition?.displayName ?? `Автомобиль ${index + 1}`,
      seats: seatDefinitions.map(({ seatId, role, side, front }) => ({
        seatId, role, side, front,
        localPosition: new Vector3(),
        entryPoint: new Vector3(),
        occupiedBy: null,
      })),
    };
    car.userData.displayName=vehicle.displayName;
    byId.set(vehicleId, vehicle);
    return vehicle;
  });

  const resolve = vehicle => typeof vehicle === 'string' ? byId.get(vehicle) : vehicle;
  const resolveSeat = (vehicle, seat) => typeof seat === 'string'
    ? vehicle.seats.find(candidate => candidate.seatId === seat) : seat;

  function refresh(vehicleOrId) {
    const vehicle = resolve(vehicleOrId);
    if (!vehicle || byId.get(vehicle.vehicleId) !== vehicle) return null;
    const halfLength = halfExtent(vehicle.car.userData.footprint?.halfLength, 1.96);
    const halfWidth = halfExtent(vehicle.car.userData.footprint?.halfWidth, 1.04);
    const definition = specialVehicles[vehicle.index];
    const anchorY = definition?.anchorY ?? .05;
    for (const seat of vehicle.seats) {
      // Match the longer cabins of the measured GLB SUVs, with side offsets
      // inside the body and entry points beyond mirrors plus walking radius.
      const x = (seat.front ? definition?.frontX ?? .3 : definition?.rearX ?? -.72) * halfLength / 1.96;
      seat.localPosition.set(x, anchorY, seat.side * halfWidth * .34);
      seat.entryPoint.set(x, -.12, seat.side * (halfWidth + .65));
    }
    return vehicle;
  }

  function worldPosition(vehicleOrId, seatOrId, field = 'entryPoint') {
    const vehicle = refresh(vehicleOrId);
    if (!vehicle) return null;
    const seat = resolveSeat(vehicle, seatOrId);
    if (!vehicle.seats.includes(seat) || !['entryPoint', 'localPosition'].includes(field)) return null;
    // updateWorldMatrix(true, false) includes parent rotation/translation even
    // when no renderer frame has updated matrixWorld yet.
    vehicle.car.updateWorldMatrix(true, false);
    return vehicle.car.localToWorld(seat[field].clone());
  }

  function claim(vehicleId, seatId, playerId) {
    const vehicle = byId.get(vehicleId);
    const seat = vehicle && resolveSeat(vehicle, seatId);
    if (!seat || !vehicle.seats.includes(seat) || typeof playerId !== 'string' || !playerId || seat.occupiedBy !== null) return false;
    seat.occupiedBy = playerId;
    return true;
  }

  function release(vehicleId, seatId, playerId) {
    const vehicle = byId.get(vehicleId);
    const seat = vehicle && resolveSeat(vehicle, seatId);
    if (!seat || !vehicle.seats.includes(seat) || !playerId || seat.occupiedBy !== playerId) return false;
    seat.occupiedBy = null;
    return true;
  }

  function serialize() {
    return vehicles.map(vehicle => ({
      vehicleId: vehicle.vehicleId,
      seats: vehicle.seats.map(({ seatId, role, occupiedBy }) => ({ seatId, role, occupiedBy })),
    }));
  }

  vehicles.forEach(refresh);
  return { vehicles, get: vehicleId => byId.get(vehicleId), refresh, worldPosition, claim, release, serialize };
}
