export const servosTokens = {
  colors: {
    canvas: 'bg-slate-950',
    panel: 'bg-slate-900',
    panelMuted: 'bg-slate-900/60',
    border: 'border-slate-800',
    accent: 'amber',
    danger: 'rose',
    success: 'emerald',
  },
  spacing: {
    page: 'p-4 sm:p-6',
    section: 'space-y-5',
    control: 'px-3 py-2.5',
  },
} as const;

export const ds = {
  button: 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-40',
  primaryButton: 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40',
  input: 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20',
  panel: 'rounded-2xl border border-slate-800 bg-slate-900/60',
  mutedPanel: 'rounded-2xl border border-slate-800 bg-slate-950/60',
  pageTitle: 'text-xl font-black tracking-tight text-white sm:text-2xl',
  eyebrow: 'text-[10px] font-black uppercase tracking-[.18em] text-amber-300',
} as const;