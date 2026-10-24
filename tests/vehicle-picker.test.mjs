import test from 'node:test';
import assert from 'node:assert/strict';
import {pickerEntries,selectPickerEntry,pickerSeatSummary} from '../src/ui/vehiclePickerState.js';
import {vehicleCatalog} from '../src/network/vehicleCatalog.js';

function registry(){
  const vehicles=vehicleCatalog.map(v=>({index:v.index,vehicleId:v.vehicleId,displayName:v.displayName??'Автомобиль '+(v.index+1),
    canDrive:true,car:{position:{x:v.x,y:v.y,z:v.z}},seats:['driver','front-passenger','rear-left','rear-right']
      .map(seatId=>({seatId,occupiedBy:null}))}));
  return {vehicles,get:id=>vehicles.find(v=>v.vehicleId===id)};
}
test('catalog lists precisely the 19 existing cars with stable identities',()=>{
  const r=registry(),entries=pickerEntries(r);
  assert.equal(entries.length,19);
  assert.equal(new Set(entries.map(e=>e.vehicleId)).size,19);
  for(const v of r.vehicles){
    assert.equal(entries[v.index].vehicleId,v.vehicleId);
    assert.equal(entries[v.index].free,4);
    assert.equal(selectPickerEntry(r,v.vehicleId),v);
  }
  assert.equal(selectPickerEntry(r,'invented-car'),null);
});
test('seat display follows occupancy without claiming seats or moving cars',()=>{
  const r=registry(),v=r.vehicles[18],original={...v.car.position};
  v.seats[0].occupiedBy='driver-1';
  let e=pickerEntries(r)[18];assert.equal(e.free,3);
  assert.equal(e.driverOccupied,true);
  assert.match(pickerSeatSummary(e),/водитель за рулём/);
  v.seats.slice(1).forEach(s=>s.occupiedBy='passenger');
  e=pickerEntries(r)[18];assert.equal(e.free,0);assert.equal(pickerSeatSummary(e),'Все места заняты');
  assert.deepEqual(v.car.position,original);assert.equal(v.seats[0].occupiedBy,'driver-1');
});
test('network lobby never invents free seats before server world arrives',()=>{
  const r=registry(),e=pickerEntries(r,{connected:true,ready:false})[0];
  assert.equal(e.free,null);assert.equal(e.driverOccupied,null);
  assert.match(pickerSeatSummary(e),/Ожидание синхронизации/);
  assert.equal(pickerEntries(r,{connected:true,ready:true})[0].free,4);
});
