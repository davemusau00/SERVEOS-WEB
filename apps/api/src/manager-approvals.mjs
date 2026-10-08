import {createHash,randomUUID} from 'node:crypto';
import {ApiProblem} from './command-kernel.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(message)=>{throw new ApiProblem(400,'VALIDATION_FAILED',message)};
const allowedPermissions=new Set(['procurement.over_receive','order.discount','order.comp','order.void','payment.reverse','till.override_variance','folio.reverse','credit.write_off','credit.override_limit','mpesa.reconcile','finance.expense.approve']);

const issue=async({tx,command,actor,at})=>{
 const p=command.payload;
 if(!uuid(p.id)||!uuid(p.recipientStaffId)||!uuid(p.approvalToken)||!allowedPermissions.has(p.permission)||typeof p.target!=='string'||!p.target.trim()||p.target.trim().length>160)fail('Choose an eligible action, target and staff member for approval.');
 if(!actor.permissions.includes('*')&&!actor.permissions.includes('staff.update'))throw new ApiProblem(403,'PERMISSION_DENIED','Staff administration permission is required to issue an approval.');
 const issuer=await tx.client.query('SELECT role FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2 AND active FOR SHARE',[actor.businessId,actor.staffId]);
 if(!issuer.rows.length||!['Admin','Manager'].includes(issuer.rows[0].role))throw new ApiProblem(403,'APPROVER_ROLE_REQUIRED','Only an active Admin or Manager can issue an approval.');
 const recipient=await tx.client.query('SELECT role FROM api_staff_profiles WHERE business_id=$1 AND staff_id=$2 AND active FOR SHARE',[actor.businessId,p.recipientStaffId]);
 if(!recipient.rows.length||recipient.rows[0].role==='Admin'||p.recipientStaffId===actor.staffId)throw new ApiProblem(400,'APPROVAL_RECIPIENT_INVALID','Choose a different active staff member who needs the approval.');
 const tokenHash=hash(p.approvalToken);
 await tx.client.query(`INSERT INTO api_manager_approvals(business_id,id,token_hash,issuer_staff_id,recipient_staff_id,permission,target_id,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[actor.businessId,p.id,tokenHash,actor.staffId,p.recipientStaffId,p.permission,p.target.trim(),at,new Date(at.getTime()+5*60_000)]);
 await tx.client.query(`INSERT INTO api_manager_approval_events(business_id,id,approval_id,event_type,staff_id,command_id,occurred_at) VALUES($1,$2,$3,'ISSUED',$4,$5,$6)`,[actor.businessId,randomUUID(),p.id,actor.staffId,command.commandId,at]);
 const value={collection:'managerApprovals',id:p.id,version:1,archived:false,data:{recipientStaffId:p.recipientStaffId,permission:p.permission,target:p.target.trim(),issuedBy:actor.staffId,issuedAt:at.toISOString(),expiresAt:new Date(at.getTime()+5*60_000).toISOString(),status:'ISSUED'}};
 return {value:{approval:value},records:[value]};
};

export async function requireManagerApproval({tx,actor,at,token,permission,target,command}){
 if(actor.permissions.includes('*')||actor.permissions.includes(permission))return null;
 if(typeof token!=='string'||!uuid(token))throw new ApiProblem(403,'MANAGER_APPROVAL_REQUIRED','A current manager approval is required for this action.');
 const {rows}=await tx.client.query(`SELECT id,issuer_staff_id AS "issuerStaffId",recipient_staff_id AS "recipientStaffId",permission,target_id AS "targetId",expires_at AS "expiresAt",consumed_at AS "consumedAt" FROM api_manager_approvals WHERE business_id=$1 AND token_hash=$2 FOR UPDATE`,[actor.businessId,hash(token)]);
 const approval=rows[0];
 if(!approval||approval.recipientStaffId!==actor.staffId||approval.permission!==permission||approval.targetId!==String(target)||approval.issuerStaffId===actor.staffId||approval.consumedAt||approval.expiresAt<=at)throw new ApiProblem(403,'MANAGER_APPROVAL_INVALID','This approval is expired, already used, or does not match this staff member, action and target.');
 const updated=await tx.client.query(`UPDATE api_manager_approvals SET consumed_at=$3,consumed_by=$4,consumed_command_id=$5 WHERE business_id=$1 AND id=$2 AND consumed_at IS NULL AND expires_at>$3`,[actor.businessId,approval.id,at,actor.staffId,command.commandId]);
 if(updated.rowCount!==1)throw new ApiProblem(409,'MANAGER_APPROVAL_ALREADY_USED','This approval was already used. Request a new approval.');
 await tx.client.query(`INSERT INTO api_manager_approval_events(business_id,id,approval_id,event_type,staff_id,command_id,occurred_at) VALUES($1,$2,$3,'CONSUMED',$4,$5,$6)`,[actor.businessId,randomUUID(),approval.id,actor.staffId,command.commandId,at]);
 return {approvalId:approval.id,approvedBy:approval.issuerStaffId,permission,target:String(target)};
}

export const managerApprovalCommandRegistry=new Map([['managerApproval.issue',{permission:'staff.update',offlinePolicy:'ONLINE_ONLY',handler:issue}]]);
