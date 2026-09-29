// Screen-owned local writes must finish before navigation or staff changes.
const guards = new Set<() => Promise<void>>();
export function guardLocalWork(guard: () => Promise<void>) {
  guards.add(guard);
  return () => { guards.delete(guard); };
}
export async function flushLocalWork() {
  for (const guard of guards) await guard();
}
