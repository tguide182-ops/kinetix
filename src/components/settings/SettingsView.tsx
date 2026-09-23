import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Coins,
  History,
  Activity,
  Server,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { CreditTransaction, AdminMetrics } from '../../types';

export const SettingsView: React.FC = () => {
  const { user, allUsers, switchUser, showToast } = useApp();

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const fetchSettingsData = async () => {
    setLoadingMetrics(true);
    try {
      const [cRes, mRes] = await Promise.all([
        api.getCreditHistory(),
        api.getAdminMetrics(),
      ]);
      setTransactions(cRes.history);
      setMetrics(mRes.metrics);
    } catch (err: any) {
      console.warn('Failed to fetch settings telemetry:', err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, [user]);

  return (
    <div className="flex-1 flex flex-col bg-[#090a0e] overflow-y-auto p-4 sm:p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <span>Studio Administration & Account</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Credit ledger, system telemetry, multi-user isolation verification, and provider status.
          </p>
        </div>

        <button
          onClick={fetchSettingsData}
          className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          title="Refresh metrics"
        >
          <RefreshCw className={`w-4 h-4 ${loadingMetrics ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* User Profile & Credit Balance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile Card */}
        <div className="p-6 rounded-3xl bg-[#111319] border border-white/[0.08] space-y-5 shadow-xl">
          <div className="flex items-center gap-4">
            <img
              src={user?.avatar}
              alt=""
              className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500/50 shadow-md"
            />
            <div>
              <h3 className="text-sm font-bold text-zinc-100">{user?.name}</h3>
              <p className="text-xs text-zinc-400 font-mono">{user?.email}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-[10px] font-mono font-bold uppercase">
                  {user?.tier} TIER
                </span>
                <span className="text-[10px] text-zinc-500 font-mono uppercase">
                  Role: {user?.role}
                </span>
              </div>
            </div>
          </div>

          {/* Switch User to verify data isolation */}
          <div className="pt-3 border-t border-white/[0.06] space-y-2">
            <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-bold">
              Verify Multi-User Data Isolation:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {allUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => switchUser(u.id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 transition-all cursor-pointer ${
                    user?.id === u.id
                      ? 'bg-zinc-800 border-emerald-500 text-emerald-300 font-semibold shadow-sm'
                      : 'bg-zinc-900 border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <img src={u.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                  <span>{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Credit Balance Card */}
        <div className="p-6 rounded-3xl bg-[#111319] border border-white/[0.08] flex flex-col justify-between space-y-5 shadow-xl">
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-zinc-300 uppercase font-mono tracking-wider flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>Available Studio Credits</span>
            </div>
            <div className="text-4xl font-extrabold font-mono text-zinc-100 tabular-nums">
              {user?.credits ?? 0} <span className="text-base font-normal text-zinc-500">CR</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Images consume 4-8 CR. Veo 3.1 video clips consume 18-36 CR based on duration and resolution.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => showToast('Test studio allocation credited (+500 CR)')}
              className="px-4 py-2.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-white/[0.08] text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Request Additional Allocation
            </button>
          </div>
        </div>
      </div>

      {/* Admin Telemetry & System Health */}
      {metrics && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Infrastructure Health & Metrics</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.06] space-y-1">
              <div className="text-[10px] uppercase font-mono text-zinc-500">
                Total Jobs Dispatched
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-100 tabular-nums">
                {metrics.totalJobs}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.06] space-y-1">
              <div className="text-[10px] uppercase font-mono text-emerald-400">
                Completed Renders
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {metrics.completedJobs}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.06] space-y-1">
              <div className="text-[10px] uppercase font-mono text-zinc-400">
                Credits Consumed
              </div>
              <div className="text-2xl font-bold font-mono text-zinc-100 tabular-nums">
                {metrics.totalCreditsBurned} CR
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#111319] border border-white/[0.06] space-y-1">
              <div className="text-[10px] uppercase font-mono text-zinc-500">
                Failed / Cancelled
              </div>
              <div className="text-2xl font-bold font-mono text-rose-400 tabular-nums">
                {metrics.failedJobs}
              </div>
            </div>
          </div>

          {/* Provider Statuses */}
          <div className="p-5 rounded-2xl bg-[#111319] border border-white/[0.06] space-y-3">
            <div className="text-xs font-bold text-zinc-300 uppercase font-mono tracking-wider">
              Generative Engine Nodes
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {metrics.providers.map((p, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-zinc-900 border border-white/[0.06] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-zinc-200 font-semibold">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      {p.status}
                    </span>
                    <span className="text-zinc-500">({p.uptime})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Credit Transaction Ledger */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
            <History className="w-4 h-4 text-emerald-400" />
            <span>Credit Ledger & Audit Trail</span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {transactions.length} Transactions
          </span>
        </div>

        <div className="border border-white/[0.06] rounded-2xl overflow-hidden bg-[#111319]">
          <div className="divide-y divide-white/[0.06] text-xs">
            {transactions.map((tx) => (
              <div key={tx.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-zinc-200 font-semibold">{tx.reason}</div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                    {new Date(tx.timestamp).toLocaleString()}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div
                    className={`font-bold tabular-nums ${
                      tx.amount > 0 ? 'text-emerald-400' : 'text-zinc-300'
                    }`}
                  >
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount} CR
                  </div>
                  <div className="text-[10px] text-zinc-500 tabular-nums">
                    Balance: {tx.balanceAfter} CR
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
