/** Convert protocol failures into next-step guidance without implying success. */
export function operatorError(error:unknown):string{
 const candidate=error instanceof Error?error.message:typeof error==='string'?error:typeof (error as any)?.message==='string'?(error as any).message:'';
 const message=candidate.replace(/^Error:\s*/,'').trim();
 if(!message)return 'The operation could not be completed. Review Activity and verify the affected record before retrying.';
 const match=message.match(/^(PERMISSION_DENIED|AUTHORIZATION_REQUIRED|CONFLICT|DUPLICATE_REFERENCE|PROTOCOL_UNSUPPORTED|INVALID_STATE|VALIDATION_FAILED):\s*(.*)$/i);
 const technical=/\bSQLSTATE\b|\bPGRST\d{3}\b|\bPostgREST\b|\bPostgreSQL\b|\bstack trace\b|\bTypeError\b|\bReferenceError\b|\bSyntaxError\b|\bHTTP(?:\/\d(?:\.\d)?)?\s*\d{3}\b|\bstatus code\s*\d{3}\b|https?:\/\/|\brpc\/[\w./-]+|\b(?:relation|column|function)\s+[\w."'-]+\s+does not exist\b|\bviolates (?:foreign key|check|unique|not-null) constraint\b|\bECONN(?:REFUSED|RESET|ABORTED)\b|\bEAI_AGAIN\b|\bETIMEDOUT\b|socket hang up|fetch failed/i;
 const recovery='ServOS could not safely confirm this action. Synchronize Activity, verify the affected record, then refresh before deciding whether to retry.';
 if(/failed to fetch|fetch failed|networkerror|network request failed|offline|ECONN(?:REFUSED|RESET|ABORTED)|EAI_AGAIN|ETIMEDOUT|socket hang up/i.test(message))return 'Connection to the business service was interrupted. Synchronize when connected and verify the affected record before retrying.';
 if(/permission denied for/i.test(message))return 'Your account may not have permission for this action. Ask an authorized manager to review access, then refresh before retrying.';
 if(/duplicate key|unique constraint|already exists/i.test(message))return 'This identifier or reference may already be in use. Check the existing record before trying again.';
 if(/could not serialize|deadlock detected/i.test(message))return 'The record changed during this action. Synchronize, refresh the affected record, and review it before retrying.';
 if(/\bPGRST\d{3}\b|schema cache|function .* does not exist/i.test(message))return 'This action is unavailable in the current Web service version. Ask an administrator to check the deployment, then retry after it is ready.';
 if(technical.test(message))return recovery;
 if(!match)return message;
 const detail=match[2].trim();
 if(technical.test(detail))return recovery;
 switch(match[1].toUpperCase()){
  case 'PERMISSION_DENIED':case 'AUTHORIZATION_REQUIRED':return 'Your role cannot complete this action. Ask an authorized manager to help.';
  case 'CONFLICT':return 'The business record changed in another session. Refresh this screen and review it before retrying.';
  case 'DUPLICATE_REFERENCE':return 'This reference was already recorded. Check the payment or reconciliation history before trying again.';
  case 'PROTOCOL_UNSUPPORTED':return 'This action is not available in the current Web rollout. No success is confirmed; contact the administrator.';
  case 'INVALID_STATE':return detail||'The record is not in a state that allows this action.';
  case 'VALIDATION_FAILED':return detail||'Some details need correction before this action can be completed.';
  default:return message;
 }
}
