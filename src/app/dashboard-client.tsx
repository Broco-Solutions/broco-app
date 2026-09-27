// @ts-nocheck
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ArrowDownRight, PlusCircle, Receipt, AlertTriangle, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Line, ComposedChart, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/money";
import { formatDate, formatDateShort } from "@/lib/dates";
import { FinancialEvolution } from "@/components/dashboard/financial-evolution";

type Data = Awaited<ReturnType<typeof import("@/server/services/dashboard").getDashboard>>;

function pctChange(cur: number, prev: number): { text: string; positive: boolean; zero: boolean } | null {
  if (prev === 0 && cur === 0) return { text: "—", positive: true, zero: true };
  if (prev === 0) return null;
  const v = ((cur - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(v)) return null;
  return { text: `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`, positive: v >= 0, zero: false };
}

function dateRangeLabel(from: Date, to: Date): string {
  const f = from.toISOString().slice(0, 10);
  const t = to.toISOString().slice(0, 10);
  return f === t ? f : `${f} – ${t}`;
}

export function DashboardClient({
  data,
  prevData,
  evolution,
  periodLabel,
  period,
  rangeFrom,
  rangeTo,
  prevFrom,
  prevTo,
}: {
  data: Data;
  prevData: Data;
  evolution: Awaited<ReturnType<typeof import("@/server/services/dashboard").getFinancialEvolution>>;
  periodLabel: string;
  period: string;
  rangeFrom: Date;
  rangeTo: Date;
  prevFrom: Date;
  prevTo: Date;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState(period === "custom" ? "custom" : (period || "this-month"));
  const [from, setFrom] = useState(period === "custom" ? rangeFrom.toISOString().slice(0, 10) : "");
  const [to, setTo] = useState(period === "custom" ? rangeTo.toISOString().slice(0, 10) : "");
  const k = data.kpis;
  const prevLabel = dateRangeLabel(prevFrom, prevTo);
  const rangeLabel = dateRangeLabel(rangeFrom, rangeTo);

  const applyPreset = (p: string) => { setPreset(p); if (p === "custom") return; router.push(`/?period=${p}`); };
  const applyCustom = () => { if (from && to) router.push(`/?period=custom&from=${from}&to=${to}`); };

  // Category chart data
  const catItems = data.categoryBreakdown.items;
  const catTop5 = catItems.slice(0, 5);
  const catOther = catItems.slice(5).reduce((s, c) => s + c.total, 0);
  const catChart = [...catTop5.map(c => ({ name: c.name, total: c.total })), ...(catOther > 0 ? [{ name: "Otros", total: catOther }] : [])];
  const catTotal = data.categoryBreakdown.total;

  // Client chart data
  const cliItems = data.clientBreakdown.items;
  const cliTop5 = cliItems.slice(0, 5);
  const cliOther = cliItems.slice(5).reduce((s, c) => s + c.total, 0);
  const cliChart = [...cliTop5.map(c => ({ name: c.name, total: c.total })), ...(cliOther > 0 ? [{ name: "Otros", total: cliOther }] : [])];
  const cliTotal = data.clientBreakdown.total;

  // Income type breakdown (Desarrollo/Mantenimiento)
  const typeItems = (data as any).incomeTypeBreakdown?.items ?? [];
  const typeTotal = (data as any).incomeTypeBreakdown?.total ?? typeItems.reduce((s: number, t: any) => s + t.total, 0);
  const typePalette: Record<string, string> = { Desarrollo: "#6366f1", Mantenimiento: "#0ea5e9" };
  const getTypeColor = (name: string, idx: number) => typePalette[name] ?? ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b"][idx % 4];

  const incomeParams = `status=PAID&from=${rangeFrom.toISOString().slice(0,10)}&to=${rangeTo.toISOString().slice(0,10)}`;
  const expenseParams = `status=PAID&from=${rangeFrom.toISOString().slice(0,10)}&to=${rangeTo.toISOString().slice(0,10)}`;

  const [upcomingFilter, setUpcomingFilter] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 gap-0.5">
          {[{k:"this-month",l:"Este mes"},{k:"last-month",l:"Mes anterior"},{k:"this-year",l:"Este año"},{k:"all",l:"Total"},{k:"custom",l:"Personalizado"}].map(o => (
            <button key={o.k} onClick={() => applyPreset(o.k)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${preset === o.k ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"}`}>{o.l}</button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="flex-1 sm:flex-none sm:w-36 text-xs h-8 min-w-0" />
            <span className="text-xs text-gray-400 hidden sm:inline">a</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 sm:flex-none sm:w-36 text-xs h-8 min-w-0" />
            <Button variant="secondary" className="text-xs w-full sm:w-auto" onClick={applyCustom}>Aplicar</Button>
          </div>
        )}
        <Badge tone="neutral" className="shrink-0">{periodLabel}</Badge>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto sm:ml-auto sm:flex sm:gap-2">
          <Link href="/incomes?new=1" className="block"><Button className="w-full sm:w-auto text-sm"><PlusCircle className="mr-1.5 h-4 w-4" />Nuevo ingreso</Button></Link>
          <Link href="/expenses?new=1" className="block"><Button className="w-full sm:w-auto text-sm bg-gray-800 text-white hover:bg-gray-900"><Receipt className="mr-1.5 h-4 w-4" />Nuevo gasto</Button></Link>
        </div>
      </div>

      {/* KPIs row 1 — Ingresos, Gastos, Neto */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Link href={`/incomes?${incomeParams}`} className="block">
          <KpiCard title="Ingresos" value={k.paidIncomesUsd} prevValue={prevData.kpis.paidIncomesUsd} detail={`${k.paidIncomesCount} mov.`} prevLabel={prevLabel} clickable />
        </Link>
        <Link href={`/expenses?${expenseParams}`} className="block">
          <KpiCard title="Gastos" value={k.paidExpensesUsd} prevValue={prevData.kpis.paidExpensesUsd} detail={`${k.paidExpensesCount} mov.`} prevLabel={prevLabel} clickable invertGreen />
        </Link>
        <KpiCard title="Resultado neto" value={k.netUsd} prevValue={prevData.kpis.netUsd} prevLabel={prevLabel} />
      </div>

      {/* KPIs row 2 — Cobros y Pagos (pendiente + vencido) */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cobros</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">Pendiente</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{formatUsd(period === "all" ? k.globalPendingIncomesUsd : k.pendingIncomesUsd)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Total actual: {formatUsd(k.globalPendingIncomesUsd)}</div>
            </div>
            <Link href="/incomes?status=OVERDUE" className="block">
              <div className="text-[10px] text-red-500 mb-0.5">Vencido</div>
              <div className="text-lg font-bold text-red-700 tabular-nums">{formatUsd(k.overdueIncomesUsd)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{k.overdueIncomesCount} ingresos</div>
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Pagos</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-gray-400 mb-0.5">Pendiente</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{formatUsd(period === "all" ? k.globalPendingExpensesUsd : k.pendingExpensesUsd)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">Total actual: {formatUsd(k.globalPendingExpensesUsd)}</div>
            </div>
            <Link href="/expenses?status=OVERDUE" className="block">
              <div className="text-[10px] text-red-500 mb-0.5">Vencido</div>
              <div className="text-lg font-bold text-red-700 tabular-nums">{formatUsd(k.overdueExpensesUsd)}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{k.overdueExpensesCount} gastos</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Main chart */}
      <Card className="p-3 sm:p-4 min-w-0">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Ingresos y gastos</h3>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[{ name: "", Ingresos: k.paidIncomesUsd, Gastos: k.paidExpensesUsd }]} margin={{ top: 20, right: 5, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={false} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip formatter={(v: any) => formatUsd(v)} />
              <Bar dataKey="Ingresos" fill="#10b981" radius={[4,4,0,0]}>
                <LabelList dataKey="Ingresos" position="top" formatter={(v: any) => formatUsd(Number(v))} style={{ fontSize: 10 }} />
              </Bar>
              <Bar dataKey="Gastos" fill="#ef4444" radius={[4,4,0,0]}>
                <LabelList dataKey="Gastos" position="top" formatter={(v: any) => formatUsd(Number(v))} style={{ fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Proyeccion mensual */}
      <Card className="p-3 sm:p-4 min-w-0">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Proyeccion proximos 6 meses</h3>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.projection} margin={{ top: 20, right: 5, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
              <Tooltip formatter={(v: any) => formatUsd(v)} labelFormatter={(l) => l} />
              <Legend iconType="rect" iconSize={10} />
              <Bar dataKey="incomesUsd" name="Ingresos" fill="#10b981" radius={[3,3,0,0]} maxBarSize={24}>
                <LabelList dataKey="incomesUsd" position="top" formatter={(v: any) => v >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : String(v)} style={{ fontSize: 9, fill: "#10b981" }} />
              </Bar>
              <Bar dataKey="expensesUsd" name="Gastos" fill="#ef4444" radius={[3,3,0,0]} maxBarSize={24}>
                <LabelList dataKey="expensesUsd" position="top" formatter={(v: any) => v >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : String(v)} style={{ fontSize: 9, fill: "#ef4444" }} />
              </Bar>
              <Line type="monotone" dataKey="netUsd" name="Neto" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: "#6366f1" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Resumen en tabla */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {data.projection.map((p) => (
            <div key={p.month} className="rounded-lg border border-gray-100 p-2 text-center text-xs">
              <div className="font-medium text-gray-500 mb-1">{p.month}</div>
              <div className="text-emerald-600 font-semibold">{formatUsd(p.incomesUsd)}</div>
              <div className="text-red-500 font-semibold">{formatUsd(p.expensesUsd)}</div>
              <div className={`font-bold mt-0.5 ${p.netUsd >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {formatUsd(p.netUsd)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Category & Income Type breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-3 sm:p-4 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Gastos por categoria</h3>
          {catChart.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">Sin gastos en este periodo.</p> : (
            <div className="space-y-2">
              {catChart.map((c, i) => (
                <div key={c.name} className="space-y-0.5">
                  <div className="flex justify-between text-xs"><span>{c.name}</span><span className="tabular-nums font-medium">{formatUsd(c.total)}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-brand" style={{width: `${catTotal > 0 ? (c.total / catTotal) * 100 : 0}%`}} /></div>
                  <div className="text-right text-[10px] text-gray-400">{catTotal > 0 ? ((c.total / catTotal) * 100).toFixed(1) : "0"}%</div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-3 sm:p-4 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Ingresos por tipo</h3>
          {typeItems.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">Sin ingresos en este periodo.</p> : (
            <div className="space-y-2">
              {typeItems.map((t: any, idx: number) => (
                <Link key={t.id} href={`/incomes?${incomeParams}&typeFilter=${t.id}`} className="block space-y-0.5 rounded-lg p-1 -m-1 hover:bg-gray-50">
                  <div className="flex justify-between text-xs"><span>{t.name}</span><span className="tabular-nums font-medium">{formatUsd(t.total)}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${typeTotal > 0 ? (t.total / typeTotal) * 100 : 0}%`, backgroundColor: getTypeColor(t.name, idx) }} /></div>
                  <div className="flex justify-between text-[10px] text-gray-400"><span>{typeTotal > 0 ? ((t.total / typeTotal) * 100).toFixed(1) : "0"}%{t.count != null ? ` · ${t.count} mov.` : ""}</span><span className="text-brand">Ver →</span></div>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-3 sm:p-4 min-w-0 lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Ingresos por cliente</h3>
          {cliChart.length === 0 ? <p className="text-xs text-gray-400 py-4 text-center">Sin ingresos en este periodo.</p> : (
            <div className="space-y-2">
              {cliTop5.map((c) => (
                <div key={c.id} className="space-y-0.5">
                  <div className="flex justify-between text-xs"><span>{c.name}</span><span className="tabular-nums font-medium">{formatUsd(c.total)}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{width: `${cliTotal > 0 ? (c.total / cliTotal) * 100 : 0}%`}} /></div>
                  <div className="space-y-0.5 pl-2">
                    {c.projects.slice(0, 3).map(p => (
                      <div key={p.id} className="flex justify-between text-[10px] text-gray-400"><span>{p.name}</span><span className="tabular-nums">{formatUsd(p.total)}</span></div>
                    ))}
                    {c.projects.length > 3 && <div className="text-[10px] text-gray-300">+ {c.projects.length - 3} proyectos</div>}
                  </div>
                </div>
              ))}
              {cliOther > 0 && (
                <div className="space-y-0.5">
                  <div className="flex justify-between text-xs"><span>Otros</span><span className="tabular-nums font-medium">{formatUsd(cliOther)}</span></div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{width: `${cliTotal > 0 ? (cliOther / cliTotal) * 100 : 0}%`}} /></div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Vencimientos + próximos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-3 sm:p-4 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">Vencidos</h3>
          <div className="space-y-1.5 text-sm">
            {k.overdueIncomesCount === 0 && k.overdueExpensesCount === 0 && <p className="text-xs text-gray-400 py-2">Sin vencidos.</p>}
            {k.overdueIncomesCount > 0 && (
              <Link href="/incomes?status=OVERDUE" className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-2.5 text-red-700 hover:bg-red-100">
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{k.overdueIncomesCount} ingresos</span>
                <span className="font-semibold tabular-nums">{formatUsd(k.overdueIncomesUsd)}</span>
              </Link>
            )}
            {k.overdueExpensesCount > 0 && (
              <Link href="/expenses?status=OVERDUE" className="flex items-center justify-between rounded-lg border border-red-100 bg-red-50 p-2.5 text-red-700 hover:bg-red-100">
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{k.overdueExpensesCount} gastos</span>
                <span className="font-semibold tabular-nums">{formatUsd(k.overdueExpensesUsd)}</span>
              </Link>
            )}
          </div>
        </Card>
        <Card className="p-3 sm:p-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Próximos 30 días</h3>
            <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 shrink-0">
              {[
                { k: "ALL", l: "Todos" },
                { k: "INCOME", l: "Ingresos" },
                { k: "EXPENSE", l: "Gastos" },
              ].map((o) => (
                <button
                  key={o.k}
                  onClick={() => setUpcomingFilter(o.k as "ALL" | "INCOME" | "EXPENSE")}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${upcomingFilter === o.k ? "bg-brand text-white" : "text-gray-600 hover:bg-gray-100"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 text-sm max-h-[320px] overflow-y-auto pr-1">
            {(() => {
              const combined = [
                ...data.upcomingIncomes.map((i) => ({ ...i, kind: "INCOME" as const })),
                ...data.upcomingExpenses.map((e) => ({ ...e, kind: "EXPENSE" as const })),
              ].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
              const filtered =
                upcomingFilter === "INCOME" ? combined.filter((x) => x.kind === "INCOME") : upcomingFilter === "EXPENSE" ? combined.filter((x) => x.kind === "EXPENSE") : combined;
              if (combined.length === 0) return <p className="text-xs text-gray-400 py-2">Sin próximos cobros ni pagos.</p>;
              if (filtered.length === 0) {
                return <p className="text-xs text-gray-400 py-2">{upcomingFilter === "INCOME" ? "Sin ingresos próximos." : "Sin gastos próximos."}</p>;
              }
              return filtered.map((item) => {
                const isIncome = item.kind === "INCOME";
                const href = isIncome ? `/incomes?status=PENDING&id=${item.id}` : `/expenses?status=PENDING&id=${item.id}`;
                return (
                  <Link key={`${item.kind}-${item.id}`} href={href} className="flex items-center gap-2 rounded-lg border border-gray-100 p-2 hover:bg-gray-50 cursor-pointer">
                    <Badge tone={isIncome ? "success" : "danger"} className="text-[10px] px-1.5 py-0.5 shrink-0">{isIncome ? "Ingreso" : "Gasto"}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs text-gray-700">{item.concept}</div>
                      <div className="text-[11px] text-gray-400">Vence {item.dueDate ? formatDateShort(item.dueDate) : "—"}</div>
                    </div>
                    <span className="font-medium tabular-nums w-20 shrink-0 text-right text-xs">{formatUsd(item.amountUsd)}</span>
                    <ArrowUpRight className="h-3 w-3 text-gray-300 shrink-0" />
                  </Link>
                );
              });
            })()}
          </div>
        </Card>
      </div>

      <FinancialEvolution evolution={evolution} />
    </div>
  );
}

function KpiCard({ title, value, prevValue, detail, prevLabel, invertGreen, clickable, global: isGlobal }: {
  title: string; value: number; prevValue?: number; detail?: string; prevLabel?: string; invertGreen?: boolean; clickable?: boolean; global?: boolean;
}) {
  const change = prevValue != null && !isGlobal ? pctChange(value, prevValue) : null;
  let trend: "up" | "down" | "neutral" = "neutral";
  if (change && !change.zero) trend = invertGreen ? (change.positive ? "down" : "up") : (change.positive ? "up" : "down");
  return (
    <div className={`kpi-card flex flex-col gap-1 ${clickable ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}>
      <div className="text-xs font-medium text-gray-500">{title}</div>
      <div className="kpi-value text-xl sm:text-2xl font-bold text-gray-900">{formatUsd(value)}</div>
      <div className="flex flex-col gap-0.5">
        {detail && <span className="text-[11px] text-gray-400">{detail}</span>}
        {change && !change.zero && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trend === "up" ? "text-positive" : "text-negative"}`}>
            {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{change.text}
            {prevLabel && <span className="text-gray-400 font-normal ml-1">vs. {prevLabel}</span>}
          </span>
        )}
        {change?.zero && prevLabel && <span className="text-xs text-gray-400">{change.text} · vs. {prevLabel}</span>}
        {change === null && prevValue != null && prevValue === 0 && value !== 0 && prevLabel && <span className="text-xs text-gray-400">Sin base comparable · vs. {prevLabel}</span>}
      </div>
    </div>
  );
}
