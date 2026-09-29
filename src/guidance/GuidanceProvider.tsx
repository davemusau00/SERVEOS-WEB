import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRuntime, type GuidanceProgress } from '../runtime/RuntimeProvider';
import { GUIDES, type GuideDefinition } from './core';
import { matchesGuideCommit, type WorkflowContext } from './workflow';

interface GuidanceContextValue {
  guides: GuideDefinition[];
  progress: GuidanceProgress[];
  activeGuide: GuideDefinition | null;
  stepIndex: number;
  start: (guideId: string) => void;
  close: () => void;
  next: () => void;
  back: () => void;
}
const GuidanceContext = createContext<GuidanceContextValue | null>(null);
export const useGuidance = () => {
  const value = useContext(GuidanceContext);
  if (!value) throw new Error('GuidanceProvider is required');
  return value;
};
export const useOptionalGuidance = () => useContext(GuidanceContext);

export function TourAnchor({ id, children }: { id: string; children: React.ReactNode }) {
  return <span data-guide-anchor={id} className="contents">{children}</span>;
}

export function GuidanceProvider({ children }: { children: React.ReactNode }) {
  const runtime = useRuntime();
  const [progress, setProgress] = useState<GuidanceProgress[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const context = useRef<WorkflowContext | null>(null);
  const guideById = useMemo(() => new Map(GUIDES.map(guide => [guide.id, guide])), []);
  const activeGuide = activeId ? guideById.get(activeId) || null : null;

  useEffect(() => {
    let current = true;
    void runtime.guidanceProgress().then(rows => { if (current) setProgress(rows); }).catch(() => undefined);
    return () => { current = false; };
  }, [runtime.session?.staffId]);

  const persist = useCallback(async (next: GuidanceProgress) => {
    setProgress(rows => [next, ...rows.filter(row => row.guideId !== next.guideId)]);
    try {
      const saved = await runtime.saveGuidanceProgress(next);
      setProgress(rows => [saved, ...rows.filter(row => row.guideId !== saved.guideId)]);
    } catch (error) {
      console.warn('Guidance progress could not be saved locally.', error);
    }
  }, [runtime]);

  const start = (guideId: string) => {
    const guide = guideById.get(guideId);
    if (!guide || (guide.permissions || []).some(permission => !runtime.snapshot?.actor.permissions.includes(permission))) return;
    const saved = progress.find(row => row.guideId === guide.id && row.guideVersion === guide.version && row.state === 'IN_PROGRESS');
    const nextIndex = saved ? Math.max(0, guide.steps.findIndex(step => step.id === saved.currentStepId)) : 0;
    context.current = null; setActiveId(guide.id); setStepIndex(nextIndex);
    void persist({ guideId: guide.id, guideVersion: guide.version, state: 'IN_PROGRESS', currentStepId: guide.steps[nextIndex]?.id || null, completedStepIds: saved?.completedStepIds || [] });
  };

  const close = useCallback(() => setActiveId(null), []);
  const move = (nextIndex: number) => {
    if (!activeGuide) return;
    if (nextIndex >= activeGuide.steps.length) {
      const previous = progress.find(row => row.guideId === activeGuide.id);
      void persist({ guideId: activeGuide.id, guideVersion: activeGuide.version, state: 'COMPLETED', currentStepId: null, completedStepIds: [...new Set([...(previous?.completedStepIds || []), ...activeGuide.steps.map(step => step.id)])] });
      setStepIndex(activeGuide.steps.length);
      return;
    }
    if (nextIndex < 0) return;
    setStepIndex(nextIndex);
    const previous = progress.find(row => row.guideId === activeGuide.id);
    void persist({ guideId: activeGuide.id, guideVersion: activeGuide.version, state: 'IN_PROGRESS', currentStepId: activeGuide.steps[nextIndex].id, completedStepIds: [...new Set([...(previous?.completedStepIds || []), activeGuide.steps[nextIndex - 1]?.id].filter((id): id is string => Boolean(id)))] });
  };

  useEffect(() => {
    const selected = (event: Event) => {
      const detail = (event as CustomEvent<{ guideId: string; context: WorkflowContext }>).detail;
      if (detail?.guideId === activeGuide?.id) context.current = detail.context;
    };
    window.addEventListener('servos:guide-context', selected);
    return () => window.removeEventListener('servos:guide-context', selected);
  }, [activeGuide?.id]);
  useEffect(() => {
  const committed = (event: Event) => {
      if (!activeGuide) return;
      const detail = (event as CustomEvent<{ operation: string; payload: Record<string, unknown> }>).detail;
      const step = activeGuide.steps[stepIndex];
      if (detail && matchesGuideCommit(step?.successOperations, context.current, detail)) { context.current = null; move(stepIndex + 1); }
    };
    window.addEventListener('servos:command-committed', committed);
    return () => window.removeEventListener('servos:command-committed', committed);
  }, [activeGuide, stepIndex, progress]);

  useEffect(() => {
    const route = activeGuide?.steps[stepIndex]?.route;
    if (route?.screen) window.dispatchEvent(new CustomEvent('servos:guide-route', { detail: route }));
  }, [activeGuide?.id, stepIndex]);

  const value: GuidanceContextValue = { guides: GUIDES.filter(guide => (guide.permissions || []).every(permission => runtime.snapshot?.actor.permissions.includes(permission))), progress, activeGuide, stepIndex, start, close, next: () => { if (!activeGuide?.steps[stepIndex]?.successOperations?.length) move(stepIndex + 1); }, back: () => move(stepIndex - 1) };
  return <GuidanceContext.Provider value={value}>{children}<GuidedTour/></GuidanceContext.Provider>;
}

function GuidedTour() {
  const { activeGuide, stepIndex, next, back, close } = useGuidance();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = activeGuide?.steps[stepIndex];
  useEffect(() => {
    if (!step?.target) { setRect(null); return; }
    const locate = () => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-guide-anchor]')).filter(target => target.dataset.guideAnchor === step.target && target.getClientRects().length > 0);
      setRect(targets[0]?.getBoundingClientRect() || null);
    };
    locate(); window.addEventListener('resize', locate); window.addEventListener('scroll', locate, true);
    const observer = new MutationObserver(locate); observer.observe(document.body, { childList: true, subtree: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(locate);
    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-guide-anchor]')).filter(target => target.dataset.guideAnchor === step.target);
    targets.forEach(target => resizeObserver?.observe(target));
    return () => { window.removeEventListener('resize', locate); window.removeEventListener('scroll', locate, true); observer.disconnect(); resizeObserver?.disconnect(); };
  }, [step?.target, stepIndex]);
  useEffect(() => {
    if (!activeGuide) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeGuide?.id, close]);
  if (!activeGuide) return null;
  const complete = stepIndex >= activeGuide.steps.length;
  return <>
    {rect && !complete && <div aria-hidden="true" className="pointer-events-none fixed z-[80] rounded-xl ring-4 ring-amber-400 ring-offset-4 ring-offset-slate-950" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} />}
    <section role="dialog" aria-modal="false" aria-label={complete ? 'Tour complete' : `${activeGuide.title}: ${step?.title}`} className="fixed bottom-4 right-4 z-[190] w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-amber-500/50 bg-slate-900 p-5 text-white shadow-2xl">
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wider text-amber-300">{activeGuide.title}</p><button className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800" onClick={close}>Close</button></div>
      {complete ? <><h2 className="mt-3 text-lg font-bold">Tour complete</h2><p className="mt-2 text-sm text-slate-300">You can reopen this tour any time from Help.</p><button className="mt-4 rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950" onClick={close}>Done</button></> : <><p className="mt-2 text-xs text-slate-500">{stepIndex + 1} of {activeGuide.steps.length}</p><h2 className="mt-2 text-lg font-bold">{step?.title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{step?.description}</p>{step?.target && !rect && <p className="mt-2 text-xs text-amber-200">This control is not visible in the current layout. Continue the tour or return to this step later.</p>}<div className="mt-5 flex items-center justify-between"><button className="rounded-lg border border-slate-700 px-3 py-2 text-sm" disabled={stepIndex === 0} onClick={back}>Back</button><button className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950" disabled={Boolean(step?.successOperations?.length)} onClick={next}>{step?.successOperations?.length ? 'Waiting for confirmed action' : stepIndex === activeGuide.steps.length - 1 ? 'Finish' : 'Next'}</button></div></>}
    </section>
  </>;
}
