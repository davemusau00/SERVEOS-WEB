export type WorkflowContext = { key: 'orderId' | 'locationId' | 'supplierId' | 'purchaseOrderId'; id: string };
export function selectGuideResource(guideId: string, context: WorkflowContext) {
  window.dispatchEvent(new CustomEvent('servos:guide-context', { detail: { guideId, context } }));
}
export function matchesGuideCommit(operations: string[] | undefined, context: WorkflowContext | null, event: { operation?: string; payload?: Record<string, unknown> }) {
  return Boolean(context && event.operation && operations?.includes(event.operation) && event.payload?.[context.key] === context.id);
}
