export const servosTokens = {
  colors: {
    canvas: 'bg-canvas',
    panel: 'bg-surface',
    panelMuted: 'bg-surface-muted',
    border: 'border-border',
    accent: 'accent',
    danger: 'danger',
    success: 'success',
  },
  spacing: {
    page: 'p-4 sm:p-6',
    section: 'space-y-5',
    control: 'px-3 py-2.5',
  },
} as const;

export const ds = {
  button: 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-fg transition hover:border-fg-muted hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:border-border',
  primaryButton: 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-accent-fg transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40',
  input: 'w-full rounded-xl border border-border bg-canvas px-3 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-muted focus:border-accent focus:ring-2 focus:ring-accent/20',
  panel: 'rounded-2xl border border-border bg-surface/60',
  mutedPanel: 'rounded-2xl border border-border bg-canvas/60',
  pageTitle: 'text-xl font-black tracking-tight text-fg sm:text-2xl',
  eyebrow: 'text-[10px] font-black uppercase tracking-[.18em] text-amber-300',
  // Semantic color utilities for components
  fg: 'text-fg',
  fgMuted: 'text-fg-muted',
  fgSubtle: 'text-fg-subtle',
  bgCanvas: 'bg-canvas',
  bgSurface: 'bg-surface',
  bgSurfaceMuted: 'bg-surface-muted',
  borderBorder: 'border-border',
  // Badge tones
  badgeNeutral: 'border-border bg-surface text-fg-muted',
  badgeSuccess: 'border-success/50 bg-success/10 text-success-fg',
  badgeWarning: 'border-warning/50 bg-warning/10 text-warning-fg',
  badgeDanger: 'border-danger/60 bg-danger/10 text-danger-fg',
  badgeInfo: 'border-info/60 bg-info/10 text-info-fg',
  // Notice tones
  noticeSuccess: 'border-success bg-success/10 text-success-fg',
  noticeWarning: 'border-warning bg-warning/10 text-warning-fg',
  noticeDanger: 'border-danger bg-danger/10 text-danger-fg',
  noticeInfo: 'border-info bg-info/10 text-info-fg',
  // Dialog/Drawer
  dialogOverlay: 'fixed inset-0 z-[180] grid place-items-center bg-black/70 p-3 sm:p-4',
  dialogPanel: 'flex max-h-[min(92dvh,56rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface text-fg shadow-2xl',
  dialogHeader: 'flex shrink-0 items-center justify-between gap-3 border-b border-border p-4 sm:px-5',
  dialogFooter: 'sticky bottom-0 flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-surface p-3 sm:px-5',
  drawerPanel: 'ml-auto flex h-[100dvh] w-full max-w-xl flex-col border-l border-border bg-canvas text-fg',
  drawerHeader: 'flex items-center justify-between border-b border-border p-4',
  // Combobox
  comboboxOverlay: 'fixed inset-0 z-[170] bg-black/60',
  comboboxList: 'absolute z-50 w-full max-h-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl',
  comboboxOption: 'block w-full rounded-lg p-2 text-left text-sm',
  comboboxOptionActive: 'bg-surface-muted',
  comboboxOptionDisabled: 'cursor-not-allowed text-fg-muted',
  comboboxEmpty: 'p-2 text-sm text-fg-muted',
  comboboxCreate: 'mt-1 w-full border-t border-border p-2 text-left text-sm font-semibold text-accent',
  // SyncState/BlockerCard
  blockerCard: 'rounded-xl border border-warning/60 bg-warning/10 p-3 text-sm text-warning-fg',
  // Form elements
  formLabel: 'block text-sm font-medium text-fg',
  formError: 'text-sm text-danger-fg',
} as const;