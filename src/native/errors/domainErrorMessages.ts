/** Convert common native/domain failures into staff-facing language. Keep raw detail in diagnostics. */
export function domainErrorMessage(error: unknown, context = 'save this change'): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const normalized = raw.toUpperCase();
  if (/VERSION_CONFLICT|VERSION CONFLICT|STALE/.test(normalized)) {
    return `This record changed on this terminal. Refresh it and review the latest values before you ${context}.`;
  }
  if (/UNIQUE_CONSTRAINT|UNIQUE constraint|ALREADY EXISTS|DUPLICATE/.test(normalized)) {
    return 'A record with the same code or identifier already exists. Check the existing list and choose a different value.';
  }
  if (/FOREIGN_KEY|FOREIGN KEY|NOT FOUND|DOES NOT EXIST/.test(normalized)) {
    return 'A selected item or location is no longer available. Choose it again from the current list.';
  }
  if (/VALIDATION_FAILED|VALIDATION FAILED|INVALID/.test(normalized)) {
    return 'Some details need attention. Review the required fields and try again.';
  }
  return raw.trim() || `We couldn't ${context}. Please review the details and try again.`;
}
