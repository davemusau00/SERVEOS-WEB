import {redactSensitiveData} from './BusinessStore';

/** Preserve browser count remnants as exportable evidence without replaying them. */
export function captureCountRecovery(businessId: string, actorId: string, storage: Storage = localStorage) {
  const physicalPrefix = `servos-web-physical-count:${businessId}:${actorId}:`;
  const legacyKey = `servos-web-count:${businessId}:${actorId}`;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => !!key && (key.startsWith(physicalPrefix) || key === legacyKey || key === `${legacyKey}:unknown`)).sort();
  const entries = keys.map(key => {
    const raw = storage.getItem(key);
    if (raw === null) return { key, status: 'REMOVED_DURING_CAPTURE' };
    if (key.endsWith(':outcome')) return { key, status: 'CAPTURED', value: redactSensitiveData(raw) };
    try { return { key, status: 'CAPTURED', value: redactSensitiveData(JSON.parse(raw)) }; }
    catch { return { key, status: 'INVALID_JSON', raw: redactSensitiveData(raw) }; }
  });
  return { capturedAt: new Date().toISOString(), atomicWithIndexedDB: false, entries };
}
