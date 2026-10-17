/** Owns mode transitions without changing Golf physics or input semantics. */
export function createControlModes(drive, pedestrian) {
  const setDriving = drive.setDriving;
  let seating,walkingOnly=false,networkSeats=false;
  drive.setDriving = active => {
    if(active&&walkingOnly)return false;
    if (seating?.isSeated()) {
      if (!seating.exit()) return false;
      if (!active) return true;
    }
    if (active && seating?.canLegacyDrive && !seating.canLegacyDrive()) return false;
    if (active) pedestrian.setWalking(false);
    if (active) drive.startLegacy(); else if (drive.state.active) setDriving(false);
    return true;
  };
  return {
    walk(active) {
      if(walkingOnly&&!active)return false;
      if (seating?.isSeated()) return seating.exit();
      if (active) drive.setDriving(false);
      return pedestrian.setWalking(active);
    },
    overview() {
      if(walkingOnly)return false;
      if (seating?.isSeated() && !seating.exit()) return false;
      pedestrian.setWalking(false); drive.setDriving(false); return true;
    },
    attachSeating(controller) { seating = controller; },
    canEnterVehicle() { return !walkingOnly||networkSeats; },
    setNetworkMode(active) {networkSeats=Boolean(active);walkingOnly=Boolean(active);},
    setWalkingOnly(active) {
      if(active) {
        if(drive.state.active||seating?.isSeated())return false;
        if(!pedestrian.setWalking(true))return false;
      }
      walkingOnly=Boolean(active);return true;
    },
    beginSeatedDriving(vehicle) { drive.startVehicle(vehicle); },
    finishSeatedDriving() { drive.stopDriving({restoreCamera:false}); },
  };
}
