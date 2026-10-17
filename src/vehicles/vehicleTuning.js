// Arcade scene units; game tuning, not measured vehicle specifications.
const compact = Object.freeze({name:'Procedural car',inertia:1,acceleration:6.2,braking:14,
  reverseAcceleration:4.2,maxSpeed:15,reverseSpeed:4.5,steerAngle:.53,steerRate:9,
  wheelbase:2.65,grip:5,slideGrip:.65,handbrakeDrag:4.5,handbrakeTurn:1.6,maxSlip:.85});
export const vehicleConfigurations = Object.freeze({
  procedural:compact,
  'parked-mercedes-gla-x156':Object.freeze({...compact,name:'Mercedes-Benz GLA X156',inertia:1.08,
    acceleration:6.4,braking:13,maxSpeed:14.5,steerAngle:.51,steerRate:8,wheelbase:2.7,
    grip:5.5,handbrakeTurn:1.45,maxSlip:.75}),
  'parked-golf-player':Object.freeze({...compact,name:'Golf VI Silver'}),
  'parked-golf-red':Object.freeze({...compact,name:'Golf VI Red',acceleration:6.5,grip:5.3,wheelbase:2.58}),
  'parked-lexus-rx':Object.freeze({...compact,name:'Lexus RX',inertia:1.2,acceleration:6.4,braking:12,maxSpeed:14,
    steerAngle:.48,steerRate:7,wheelbase:2.79,grip:5.8,handbrakeTurn:1.3,maxSlip:.65}),
  'parked-mercedes-gl':Object.freeze({...compact,name:'Mercedes GL X166',inertia:1.35,acceleration:6.6,braking:11.5,
    maxSpeed:13.5,steerAngle:.46,steerRate:6.5,wheelbase:3.075,grip:6,handbrakeTurn:1.25,maxSlip:.6}),
});
export function vehicleTuning(id){return vehicleConfigurations[id] ?? compact;}
