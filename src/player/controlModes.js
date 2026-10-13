/** Owns mode transitions without changing Golf physics or input semantics. */
export function createControlModes(drive, pedestrian) {
  const setDriving = drive.setDriving;
  drive.setDriving = active => {
    if (active) pedestrian.setWalking(false);
    setDriving(active);
  };
  return {
    walk(active) {
      if (active) drive.setDriving(false);
      return pedestrian.setWalking(active);
    },
    overview() { pedestrian.setWalking(false); drive.setDriving(false); },
  };
}
