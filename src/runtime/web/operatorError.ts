/** Convert protocol failures into next-step guidance without implying success. */
export function operatorError(error:unknown):string{
 const message=String(error instanceof Error?error.message:(error as any)?.message||error||'The operation could not be completed.').replace(/^Error:\s*/,'').trim();
 const match=message.match(/^(PERMISSION_DENIED|AUTHORIZATION_REQUIRED|CONFLICT|DUPLICATE_REFERENCE|PROTOCOL_UNSUPPORTED|INVALID_STATE|VALIDATION_FAILED):\s*(.*)$/i);
 if(!match)return /failed to fetch|networkerror|network request failed|offline/i.test(message)
  ?'Connection to the business service was interrupted. Refresh the latest records before deciding whether to retry.'
  :message;
 const detail=match[2].trim();
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
