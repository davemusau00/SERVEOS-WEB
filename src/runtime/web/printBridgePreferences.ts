import type {ApprovedBridge} from './printBridgeTransport';
const key=(businessId:string,deviceId:string)=>`servos-print-bridge:${businessId}:${deviceId}`;
export function validateBridgePreference(bridge:ApprovedBridge):ApprovedBridge{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(bridge.bridgeId))throw new Error('Enter the installed bridge UUID.');
 const origin=new URL(bridge.origin);
 if(origin.protocol!=='https:'||origin.origin!==bridge.origin||!['localhost','127.0.0.1'].includes(origin.hostname)||Number(origin.port||443)<1024)throw new Error('Use the installed bridge HTTPS localhost origin and dedicated port.');
 return bridge;
}
export function readBridgePreference(businessId:string,deviceId:string):ApprovedBridge|undefined{
 const raw=localStorage.getItem(key(businessId,deviceId));if(!raw)return;
 const saved=JSON.parse(raw) as ApprovedBridge;if(saved.businessId!==businessId)throw new Error('Bridge selection belongs to a different business.');return validateBridgePreference(saved);
}
export function saveBridgePreference(bridge:ApprovedBridge,deviceId:string):void{
 localStorage.setItem(key(bridge.businessId,deviceId),JSON.stringify(validateBridgePreference(bridge)));
 window.dispatchEvent(new Event('servos:bridge-preference'));
}
