/** Owns mode transitions without changing Golf physics or input semantics. */
export function createControlModes(drive, pedestrian) {
  const setDriving = drive.setDriving;
  let seating;
  drive.setDriving = active => {
    if (seating?.isSeated()) {
      if (!seating.exit()) return false;
      if (!active) return true;
    }
    if (active && seating?.canLegacyDrive && !seating.canLegacyDrive()) return false;
    if (active) pedestrian.setWalking(false);
    setDriving(active);
    return true;
  };
  return {
    walk(active) {
      if (seating?.isSeated()) return seating.exit();
      if (active) drive.setDriving(false);
      return pedestrian.setWalking(active);
    },
    overview() {
      if (seating?.isSeated() && !seating.exit()) return false;
      pedestrian.setWalking(false); drive.setDriving(false); return true;
    },
    attachSeating(controller) { seating = controller; },
    beginSeatedDriving() { setDriving(true); },
    finishSeatedDriving() { drive.stopDriving({restoreCamera:false}); },
  };
}
