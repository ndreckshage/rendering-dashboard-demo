"use client";

import { useMemo, useState, useCallback } from "react";
import type {
  BoundaryMetric,
  QueryMetric,
  SubgraphOperationMetric,
} from "@/lib/metrics-store";
import { SUBGRAPHS, type SubgraphName } from "@/lib/gql-federation";
import { percentile } from "@/lib/percentile";

interface Props {
  boundaries: BoundaryMetric[];
  queries: QueryMetric[];
  subgraphOps: SubgraphOperationMetric[];
  pctl: number;
}

interface SubgraphSummary {
  name: string;
  color: string;
  opsPerReq: number;
  cachedPerReq: number;
  uncachedPerReq: number;
  durationPctl: number;
  pctOfTotal: number;
  operations: OperationDetail[];
}

interface OperationDetail {
  name: string;
  countPerReq: number;
  cachedPct: number;
  durationPctl: number;
  boundaries: string[];
  queryNames: string[];
}

export function SubgraphCallsTab({ boundaries, queries, subgraphOps, pctl }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const { summaryCards, subgraphRows } = useMemo(() => {
    if (subgraphOps.length === 0) {
      return {
        summaryCards: { queriesPerReq: 0, cachedQueriesPerReq: 0, opsPerReq: 0, cacheHitRatio: 0, uniqueSubgraphs: 0 },
        subgraphRows: [],
      };
    }

    // Group everything by requestId
    const requestIds = new Set(subgraphOps.map((o) => o.requestId));
    const numRequests = requestIds.size;

    // --- Summary cards ---
    // Queries per request
    const queriesPerRequest = new Map<string, Set<string>>();
    const cachedQueriesPerRequest = new Map<string, number>();
    for (const q of queries) {
      const set = queriesPerRequest.get(q.requestId) ?? new Set();
      set.add(q.queryName);
      queriesPerRequest.set(q.requestId, set);
      if (q.fullyCached) {
        cachedQueriesPerRequest.set(q.requestId, (cachedQueriesPerRequest.get(q.requestId) ?? 0) + 1);
      }
    }
    const totalQueries = [...queriesPerRequest.values()].reduce((sum, s) => sum + s.size, 0);
    const totalCachedQueries = [...cachedQueriesPerRequest.values()].reduce((sum, n) => sum + n, 0);

    // Ops per request
    const opsPerRequest = new Map<string, number>();
    let totalCachedOps = 0;
    let totalOps = 0;
    for (const op of subgraphOps) {
      opsPerRequest.set(op.requestId, (opsPerRequest.get(op.requestId) ?? 0) + 1);
      totalOps++;
      if (op.cached) totalCachedOps++;
    }

    const uniqueSubgraphs = new Set(subgraphOps.map((o) => o.subgraphName)).size;

    const summaryCards = {
      queriesPerReq: Math.round((totalQueries / numRequests) * 10) / 10,
      cachedQueriesPerReq: Math.round((totalCachedQueries / numRequests) * 10) / 10,
      opsPerReq: Math.round((totalOps / numRequests) * 10) / 10,
      cacheHitRatio: totalOps > 0 ? Math.round((totalCachedOps / totalOps) * 100) : 0,
      uniqueSubgraphs,
    };

    // --- Per-subgraph breakdown ---
    // Group ops by subgraph
    const opsBySubgraph = new Map<string, SubgraphOperationMetric[]>();
    for (const op of subgraphOps) {
      const list = opsBySubgraph.get(op.subgraphName) ?? [];
      list.push(op);
      opsBySubgraph.set(op.subgraphName, list);
    }

    const subgraphRows: SubgraphSummary[] = [];

    for (const [sgName, sgOps] of opsBySubgraph) {
      const color = SUBGRAPHS[sgName as SubgraphName]?.color ?? "rgb(161, 161, 170)";

      // Per-request counts
      const perReqTotal = new Map<string, number>();
      const perReqCached = new Map<string, number>();
      for (const op of sgOps) {
        perReqTotal.set(op.requestId, (perReqTotal.get(op.requestId) ?? 0) + 1);
        if (op.cached) {
          perReqCached.set(op.requestId, (perReqCached.get(op.requestId) ?? 0) + 1);
        }
      }
      const sgTotal = [...perReqTotal.values()].reduce((s, n) => s + n, 0);
      const sgCached = [...perReqCached.values()].reduce((s, n) => s + n, 0);

      // Duration percentile (uncached only)
      const uncachedDurations = sgOps.filter((o) => !o.cached).map((o) => o.duration_ms);

      // Per-operation detail
      const opsByName = new Map<string, SubgraphOperationMetric[]>();
      for (const op of sgOps) {
        const list = opsByName.get(op.operationName) ?? [];
        list.push(op);
        opsByName.set(op.operationName, list);
      }

      const operations: OperationDetail[] = [];
      for (const [opName, ops] of opsByName) {
        const opPerReq = new Map<string, number>();
        let opCached = 0;
        for (const op of ops) {
          opPerReq.set(op.requestId, (opPerReq.get(op.requestId) ?? 0) + 1);
          if (op.cached) opCached++;
        }
        const opTotal = [...opPerReq.values()].reduce((s, n) => s + n, 0);
        const opUncachedDurations = ops.filter((o) => !o.cached).map((o) => o.duration_ms);

        const boundarySet = new Set(ops.map((o) => o.boundary_path));
        const querySet = new Set(ops.map((o) => o.queryName));

        operations.push({
          name: opName,
          countPerReq: Math.round((opTotal / numRequests) * 10) / 10,
          cachedPct: ops.length > 0 ? Math.round((opCached / ops.length) * 100) : 0,
          durationPctl: percentile(opUncachedDurations, pctl),
          boundaries: [...boundarySet],
          queryNames: [...querySet],
        });
      }

      operations.sort((a, b) => b.countPerReq - a.countPerReq);

      subgraphRows.push({
        name: sgName,
        color,
        opsPerReq: Math.round((sgTotal / numRequests) * 10) / 10,
        cachedPerReq: Math.round((sgCached / numRequests) * 10) / 10,
        uncachedPerReq: Math.round(((sgTotal - sgCached) / numRequests) * 10) / 10,
        durationPctl: percentile(uncachedDurations, pctl),
        pctOfTotal: totalOps > 0 ? Math.round((sgTotal / totalOps) * 100) : 0,
        operations,
      });
    }

    subgraphRows.sort((a, b) => b.opsPerReq - a.opsPerReq);

    return { summaryCards, subgraphRows };
  }, [subgraphOps, queries, pctl]);

  if (subgraphOps.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No metrics data. Generate load to populate the dashboard.
      </div>
    );
  }

  const pLabel = `p${pctl}`;
  const maxOpsPerReq = Math.max(...subgraphRows.map((r) => r.opsPerReq), 1);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Queries / request"
          value={summaryCards.queriesPerReq}
          detail={`${summaryCards.cachedQueriesPerReq} cached`}
        />
        <SummaryCard
          label="Subgraph ops / request"
          value={summaryCards.opsPerReq}
        />
        <SummaryCard
          label="Cache hit ratio"
          value={`${summaryCards.cacheHitRatio}%`}
          detail={summaryCards.cacheHitRatio > 30 ? "dedup active" : "low — caching opportunity"}
          detailColor={summaryCards.cacheHitRatio > 30 ? "text-green-500" : "text-amber-400"}
        />
        <SummaryCard
          label="Subgraphs called"
          value={summaryCards.uniqueSubgraphs}
          detail={`of ${Object.keys(SUBGRAPHS).length} total`}
        />
      </div>

      {/* Per-subgraph table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono table-fixed" style={{ minWidth: "650px" }}>
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800">
              <th className="text-left py-2 px-2 font-normal" style={{ width: "22%" }}>Subgraph</th>
              <th className="text-right py-2 px-2 font-normal" style={{ width: "10%" }}>Ops/req</th>
              <th className="text-right py-2 px-2 font-normal" style={{ width: "10%" }}>Cached</th>
              <th className="text-right py-2 px-2 font-normal" style={{ width: "10%" }}>Uncached</th>
              <th className="text-right py-2 px-2 font-normal" style={{ width: "12%" }}>
                Duration
                <br />
                <span className="text-zinc-600">{pLabel}</span>
              </th>
              <th className="text-right py-2 px-2 font-normal" style={{ width: "8%" }}>% total</th>
              <th className="py-2 px-2 font-normal" style={{ width: "28%" }}>
                <span className="sr-only">Distribution</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {subgraphRows.map((row) => {
              const isExpanded = expanded.has(row.name);
              return (
                <SubgraphRow
                  key={row.name}
                  row={row}
                  isExpanded={isExpanded}
                  maxOpsPerReq={maxOpsPerReq}
                  onToggle={() => toggleExpand(row.name)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  detailColor = "text-zinc-500",
}: {
  label: string;
  value: string | number;
  detail?: string;
  detailColor?: string;
}) {
  return (
    <div className="bg-zinc-800 rounded-lg p-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
      {detail && <div className={`text-xs mt-0.5 ${detailColor}`}>{detail}</div>}
    </div>
  );
}

function SubgraphRow({
  row,
  isExpanded,
  maxOpsPerReq,
  onToggle,
}: {
  row: SubgraphSummary;
  isExpanded: boolean;
  maxOpsPerReq: number;
  onToggle: () => void;
}) {
  const barWidth = Math.max(2, (row.opsPerReq / maxOpsPerReq) * 100);
  const cachedWidth = row.opsPerReq > 0 ? (row.cachedPerReq / row.opsPerReq) * barWidth : 0;
  const uncachedWidth = barWidth - cachedWidth;

  return (
    <>
      <tr
        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-1.5 px-2">
          <div className="flex items-center gap-2">
            <button className="text-zinc-500 hover:text-zinc-300 w-4 text-center flex-shrink-0">
              {isExpanded ? "\u25BE" : "\u25B8"}
            </button>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: row.color }}
            />
            <span className="text-zinc-200">{row.name.replace("-subgraph", "")}</span>
          </div>
        </td>
        <td className="text-right py-1.5 px-2 text-zinc-300 font-medium">{row.opsPerReq}</td>
        <td className="text-right py-1.5 px-2 text-cyan-600">{row.cachedPerReq}</td>
        <td className="text-right py-1.5 px-2 text-zinc-300">{row.uncachedPerReq}</td>
        <td className="text-right py-1.5 px-2 text-zinc-300">{row.durationPctl}ms</td>
        <td className="text-right py-1.5 px-2 text-zinc-500">{row.pctOfTotal}%</td>
        <td className="py-1.5 px-2">
          <div className="flex items-center h-4">
            <div className="flex h-2.5 rounded-sm overflow-hidden">
              {uncachedWidth > 0 && (
                <div
                  className="h-full rounded-l-sm"
                  style={{ width: `${uncachedWidth * 1.5}px`, backgroundColor: row.color, minWidth: "2px" }}
                />
              )}
              {cachedWidth > 0 && (
                <div
                  className="h-full rounded-r-sm opacity-30"
                  style={{ width: `${cachedWidth * 1.5}px`, backgroundColor: row.color, minWidth: "2px" }}
                />
              )}
            </div>
          </div>
        </td>
      </tr>
      {isExpanded &&
        row.operations.map((op) => (
          <tr key={op.name} className="border-b border-zinc-800/30 bg-zinc-900/50">
            <td className="py-1 px-2" colSpan={1}>
              <div className="flex items-center gap-1.5 pl-9">
                <span className="text-zinc-600">&#x2514;</span>
                <span className="text-zinc-400">{op.name}</span>
              </div>
            </td>
            <td className="text-right py-1 px-2 text-zinc-400">{op.countPerReq}</td>
            <td className="text-right py-1 px-2 text-cyan-700">{op.cachedPct}%</td>
            <td className="text-right py-1 px-2" />
            <td className="text-right py-1 px-2 text-zinc-400">{op.durationPctl}ms</td>
            <td className="py-1 px-2" colSpan={2}>
              <div className="flex flex-wrap gap-1">
                {op.boundaries.map((bp) => (
                  <span
                    key={bp}
                    className="text-xs bg-zinc-800 text-zinc-500 rounded px-1.5 py-0.5"
                    title={`Boundary: ${bp}`}
                  >
                    {bp.split(".").pop()}
                  </span>
                ))}
                {op.queryNames.map((qn) => (
                  <span
                    key={qn}
                    className="text-xs bg-teal-900/30 text-teal-600 rounded px-1.5 py-0.5"
                    title={`Query: ${qn}`}
                  >
                    {qn}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        ))}
    </>
  );
}
