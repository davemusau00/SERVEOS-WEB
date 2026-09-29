import React from 'react';
import { useRuntime } from './RuntimeProvider';

export const NativeQueuePanel = ({ onClose }: { onClose: () => void }) => {
  const runtime = useRuntime()!;
  return <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4"><section role="dialog" aria-modal="true" aria-labelledby="sync-title" className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-lg w-full space-y-4"><div className="flex justify-between"><h2 id="sync-title" className="text-xl font-bold">Terminal synchronization</h2><button onClick={onClose}>Close</button></div><p>{runtime.snapshot!.pendingCount} locally committed operations awaiting server acknowledgement.</p><p>Last successful sync: {runtime.snapshot!.lastSync ? new Date(runtime.snapshot!.lastSync).toLocaleString() : 'Never'}</p><p className="text-sm text-slate-400">Records remain on the terminal during server outages. Synchronization does not submit payments or fiscal documents to external providers.</p>{runtime.error && <p role="alert" className="text-rose-300">{runtime.error}</p>}<button className="bg-amber-400 text-slate-950 rounded p-3 disabled:opacity-50" disabled={runtime.syncing} onClick={() => void runtime.sync()}>{runtime.syncing ? 'Synchronizing…' : 'Synchronize now'}</button></section></div>;
};
