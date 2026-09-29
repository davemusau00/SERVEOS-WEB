import React from 'react';
import { useServOS } from '../../context/ServOSContext';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toast, closeToast } = useServOS();

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed top-4 right-4 sm:top-5 sm:right-6 z-50 max-w-md w-[calc(100vw-2rem)] sm:w-auto animate-in fade-in slide-in-from-top-2 duration-200">
      <div
        className={`flex items-start gap-3 p-3.5 sm:p-4 rounded-xl shadow-2xl border backdrop-blur-md transition-all ${
          isSuccess
            ? 'bg-slate-900/95 border-emerald-500/50 text-slate-100'
            : isError
            ? 'bg-slate-900/95 border-rose-500/50 text-slate-100'
            : 'bg-slate-900/95 border-amber-500/50 text-slate-100'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {isSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : isError ? (
            <AlertTriangle className="w-5 h-5 text-rose-400" />
          ) : (
            <Info className="w-5 h-5 text-amber-400" />
          )}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="text-xs font-semibold font-sans leading-relaxed break-words">
            {toast.message}
          </div>
        </div>

        <button
          onClick={closeToast}
          className="shrink-0 p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          aria-label="Dismiss toast"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
