import type {BusinessRecord} from './session';
import type {ApiProfitAndLoss} from './apiClient';

export type AccountingPeriodStatus='OPEN'|'REVIEW_REQUIRED'|'CLOSED';
export interface AccountingPeriodAssessment {
 assessmentVersion:1;status:'REVIEW_REQUIRED';eligibleForClose:false;authoritativeCloseSupported:false;
 counts:Record<string,number>;blockers:Array<{code:string;count:number|null;message:string}>;
 offlineQueueCoverage:'UNPROVEN';statementStatus:string;assessedAt:string;
}
export type AccountingPeriodRecord=BusinessRecord&{collection:'accountingPeriods';data:{
 id:string;from:string;to:string;timeZone:string;status:AccountingPeriodStatus;version:number;
 currentReviewId:string|null;lastClosedReviewId:string|null;createdBy:string;createdAt:string;updatedAt:string;closedBy:string|null;closedAt:string|null;
}};
export type AccountingPeriodPolicyRecord=BusinessRecord&{collection:'accountingPeriodPolicy';data:{
 id:string;enabled:boolean;version:number;authoritativeCloseSupported:false;updatedBy:string;updatedAt:string;
}};
export type AccountingPeriodReviewRecord=BusinessRecord&{collection:'accountingPeriodReviews';data:{
 id:string;periodId:string;periodVersion:number;purpose:'REVIEW'|'CLOSE_REQUEST'|'CLOSED';reason:string;
 assessment:AccountingPeriodAssessment;
 statementSnapshot?:{snapshotVersion:1;period:{id:string;from:string;to:string;timeZone:string;version:number;status:AccountingPeriodStatus};statement:ApiProfitAndLoss;assessment:AccountingPeriodAssessment};
 statementStatus:string;reportVersion:number;reportGeneratedAt:string;from:string;to:string;timeZone:string;
 snapshotHash:string;sourceCommandId:string;recordedBy:string;recordedByName:string;recordedAt:string;
}};
export interface ApiAccountingPeriodState {
 authoritativeCloseSupported:false;generatedAt:string;policy:AccountingPeriodPolicyRecord|null;
 periods:AccountingPeriodRecord[];reviews:AccountingPeriodReviewRecord[];events:BusinessRecord[];
 totalPeriods:number;totalReviews:number;totalEvents:number;
}
