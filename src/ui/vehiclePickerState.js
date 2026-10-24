/** Read-only catalog projection. Never changes seats, ownership or vehicle positions. */
export function pickerEntries(registry, {connected=false, ready=true}={}) {
  return registry.vehicles.map(v=>{
    const seats=v.seats??[];
    const unknown=connected&&!ready;
    const free=unknown?null:seats.filter(s=>!s.occupiedBy).length;
    const driver=unknown?null:seats.some(s=>s.seatId==='driver'&&s.occupiedBy!=null);
    return {vehicleId:v.vehicleId,index:v.index,name:v.displayName,free,capacity:seats.length,
      driverOccupied:driver,canDrive:v.canDrive!==false};
  });
}
export function selectPickerEntry(registry,vehicleId) {
  return registry.get(vehicleId)??null;
}
export function pickerSeatSummary(entry) {
  if(entry.free===null)return 'Ожидание синхронизации мест';
  if(entry.free===0)return 'Все места заняты';
  return 'Свободно '+entry.free+' из '+entry.capacity+(entry.driverOccupied?' · водитель за рулём':'');
}
