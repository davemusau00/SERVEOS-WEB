import type {BusinessRecord} from './session';

export type HistoricalCostKind='POS_CONSUMPTION'|'POS_BILL'|'PHYSICAL_RETURN'|'VOID_LOSS'|'WASTE'|'WASTE_REVERSAL';
export type HistoricalCostPolicyRecord=BusinessRecord&{collection:'historicalCostPolicy';data:{
 id:string;enabled:boolean;recognitionBasis:'UNAPPROVED';postingEnabled:false;version:number;reviewReference:string|null;updatedBy:string;updatedAt:string;
}};
export type HistoricalCostSourceRecord=BusinessRecord&{collection:'historicalCostSources';data:{
 id:string;kind:HistoricalCostKind;sourceKey:string;orderId:string|null;lineId:string|null;stockItemId:string|null;movementId:string|null;documentId:string|null;originalSourceId:string|null;
 reference:string;description:string;amountMinor:number|null;currency:'KES';state:'EVIDENCE_RECORDED'|'RECONCILIATION_REQUIRED';coverage:string[];snapshotHash:string;policyVersion:number;sourceCommandId:string;occurredAt:string;recordedAt:string;postingStatus:'UNPOSTED';
 sourceSnapshot?:{snapshotVersion:1;kind:HistoricalCostKind;sourceKey:string;amountMinor:number|null;coverage:string[];evidence:Record<string,unknown>};
}};
export type HistoricalCostReviewRecord=BusinessRecord&{collection:'historicalCostReviews';data:{
 id:string;sourceId:string;disposition:'EVIDENCE_REVIEWED'|'RECONCILIATION_REQUIRED';reason:string;accountingReference:string;financialJournalId:null;sourceCommandId:string;reviewedBy:string;reviewedByName:string;reviewedAt:string;
 proposedJournal:{proposalVersion:1;postingStatus:'UNAVAILABLE';recognitionBasis:'UNAPPROVED';sourceHash:string;currency:'KES';amountMinor:number|null;lines:Array<{accountCode:string;debitMinor:number;creditMinor:number}>;balanced:boolean;requirements:string[];note:string};
}};
export interface ApiHistoricalCostState {
 policy:HistoricalCostPolicyRecord|null;items:HistoricalCostSourceRecord[];kind:HistoricalCostKind|'ALL';hasMore:boolean;nextCursor:string|null;total:number;exceptions:number;generatedAt:string;postingEnabled:false;recognitionBasis:'UNAPPROVED';
}
export interface ApiHistoricalCostSource {
 source:HistoricalCostSourceRecord;reviews:HistoricalCostReviewRecord[];totalReviews:number;postingEnabled:false;
}
