import { Hourglass, CircleCheck, AlertCircle, RefreshCw } from 'lucide-react';
import type { Penalty } from '../types/types';

interface Props {
  penalties: Penalty[];
}

export default function PenaltyDispatcher({ penalties = [] }: Props) {
  if (penalties.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">Active Modifiers (Emlalock)</h3>
      <div className="space-y-3">
        {penalties.map((penalty) => (
          <div key={penalty.id} className="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/5 rounded-sm nuria-glow transition-colors hover:bg-white/[0.04]">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest text-white/40">Status</span>
              <div className="flex items-center gap-2">
                {penalty.status === 'pending' && <span className="text-[9px] bg-amber-950 text-amber-500 px-2 py-0.5 rounded border border-amber-900/50 flex items-center gap-1 uppercase tracking-widest"><Hourglass className="w-3 h-3 animate-pulse" /> Pending</span>}
                {penalty.status === 'success' && <span className="text-[9px] bg-emerald-950 text-emerald-500 px-2 py-0.5 rounded border border-emerald-900/50 flex items-center gap-1 uppercase tracking-widest"><CircleCheck className="w-3 h-3" /> SECURED</span>}
                {penalty.status === 'error' && (
                  <button className="text-[9px] bg-red-950 text-red-500 hover:bg-red-900 px-2 py-0.5 rounded border border-red-900/50 flex items-center gap-1 uppercase tracking-widest transition-colors" title="Strafe erneut senden">
                    <AlertCircle className="w-3 h-3" />
                    FAILED - RETRY <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-end justify-between border-t border-white/10 pt-2">
              <span className="text-white/40 text-[10px] uppercase tracking-widest">Time Assigned</span>
              <span className="text-sm font-mono text-white tracking-widest">{penalty.duration} MINUTES</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
