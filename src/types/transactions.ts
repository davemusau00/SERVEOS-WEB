/** Protocol v2 is staged; never send these commands to the legacy snapshot uploader. */
export type TransactionState = 'DRAFT' | 'COMMITTED_LOCAL' | 'PENDING_SYNC' | 'SYNCHRONIZED' | 'CONFLICT' | 'REJECTED';
export interface RecordVersion { collection:string; id:string; version:number }
export interface AllocationReference { id:string; version:number }
export interface BusinessCommandV2 {
  id:string; schemaVersion:2; deviceId:string; actorId:string; operation:string;
  payload:Record<string,unknown>; expectedVersions:RecordVersion[]; allocationRefs:AllocationReference[];
  clientSequence:number; occurredAt:string;
}
export interface TransactionResult {
  commandId:string; status:TransactionState; serverSequence?:number; recordVersions:RecordVersion[]; auditReference?:string;
  error?:{code:string;message:string;retryable:boolean};
}
export interface ChangePage { cursor:number; hasMore:boolean; changes:Array<{sequence:number;commandId:string;actorId?:string;deviceId?:string;occurredAt:string;records:Array<RecordVersion & {data:Record<string,unknown>;archived:boolean}>}> }
export interface OfflineGrant {
  id:string; deviceId:string; actorId:string; policyVersion:number; notBefore:string; expiresAt:string;
  permissions:string[]; allocations:Array<AllocationReference & {kind:'STOCK'|'ROOM'|'ORDER'|'TABLE'|'FOLIO'|'CREDIT'|'POINTS'|'TICKET'|'ASSET';resourceId:string;remaining:number;startsAt?:string;endsAt?:string}>;
}
