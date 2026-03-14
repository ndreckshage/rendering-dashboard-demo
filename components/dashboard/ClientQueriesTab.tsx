"use client";

import { useMemo } from "react";
import type {
  QueryMetric,
  SubgraphOperationMetric,
} from "@/lib/metrics-store";
import { SUBGRAPHS, GQL_QUERIES, SUBGRAPH_OPERATIONS, type SubgraphName } from "@/lib/gql-federation";
import { percentile } from "@/lib/percentile";

interface Props {
  queries: QueryMetric[];
  subgraphOps: SubgraphOperationMetric[];
  pctl: number;
  hydrationTimes?: Record<string, number>;
}

interface CsrQueryRow {
  queryName: string;
  operations: string[];
  durationPctl: number;
  sloMs: number;
  sloStatus: "ok" | "warn" | "breach";
  subgraphColors: string[];
}

export function ClientQueriesTab({
  queries,
  subgraphOps,
  pctl,
  hydrationTimes,
}: Props) {
  // Filter to CSR-only metrics
  const csrQueries = useMemo(
    () => queries.filter((q) => q.phase === "csr"),
    [queries],
  );
  const csrOps = useMemo(
    () => subgraphOps.filter((o) => o.phase === "csr"),
    [subgraphOps],
  );

  const medianHydration = useMemo(() => {
    if (!hydrationTimes) return 0;
    const values = Object.values(hydrationTimes);
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return Math.round(
      sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2,
    );
  }, [hydrationTimes]);

  const { rows, summary } = useMemo(() => {
    if (csrQueries.length === 0) {
      return { rows: [], summary: { queryCount: 0, totalDuration: 0, opsPerReq: 0 } };
    }

    const requestIds = new Set(csrQueries.map((q) => q.requestId));
    const numRequests = requestIds.size;

    // Group by queryName
    const byName = new Map<string, QueryMetric[]>();
    for (const q of csrQueries) {
      const list = byName.get(q.queryName) ?? [];
      list.push(q);
      byName.set(q.queryName, list);
    }

    const rows: CsrQueryRow[] = [];
    let maxEnd = 0;

    for (const [queryName, qMetrics] of byName) {
      const durations = qMetrics.map((q) => q.duration_ms);
      const durationPctl = percentile(durations, pctl);
      const queryDef = GQL_QUERIES[queryName];
      const sloMs = queryDef?.sloMs ?? 0;
      const sloStatus: CsrQueryRow["sloStatus"] =
        durationPctl > sloMs
          ? "breach"
          : durationPctl > sloMs * 0.8
            ? "warn"
            : "ok";

      const ops = queryDef?.operations ?? [];
      const subgraphColors = ops.map((opName) => {
        const opDef = SUBGRAPH_OPERATIONS[opName];
        if (!opDef) return "rgb(161, 161, 170)";
        return SUBGRAPHS[opDef.subgraph as SubgraphName]?.color ?? "rgb(161, 161, 170)";
      });

      rows.push({
        queryName,
        operations: ops,
        durationPctl,
        sloMs,
        sloStatus,
        subgraphColors,
      });

      // Track max end for "total duration" estimate
      const ends = qMetrics.map(
        (q) => {
          // Find matching boundary to get wall_start
          // Approximate: use duration as the end offset
          return q.duration_ms;
        },
      );
      maxEnd = Math.max(maxEnd, percentile(ends, pctl));
    }

    rows.sort((a, b) => a.durationPctl - b.durationPctl);

    return {
      rows,
      summary: {
        queryCount: byName.size,
        totalDuration: maxEnd,
        opsPerReq:
          Math.round((csrOps.filter((o) => !o.cached).length / numRequests) * 10) / 10,
      },
    };
  }, [csrQueries, csrOps, pctl]);

  if (csrQueries.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p>No client-side query data yet.</p>
        <p className="text-sm mt-2">
          Generate load or visit the product page to collect CSR metrics.
        </p>
      </div>
    );
  }

  const pLabel = `p${pctl}`;
  const maxDuration = Math.max(...rows.map((r) => r.durationPctl), 1);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-zinc-500">Client queries / request: </span>
          <span className="text-white font-medium">{summary.queryCount}</span>
        </div>
        <div>
          <span className="text-zinc-500">Subgraph ops / request: </span>
          <span className="text-white font-medium">{summary.opsPerReq}</span>
        </div>
        {medianHydration > 0 && (
          <div>
            <span className="text-zinc-500">Median hydration: </span>
            <span className="text-amber-400 font-medium">{medianHydration}ms</span>
          </div>
        )}
      </div>

      {/* Mini timeline */}
      <div>
        <div className="text-xs text-zinc-400 mb-2 font-medium">
          Client Query Timeline{" "}
          <span className="text-zinc-600">(relative to hydration)</span>
        </div>
        <div className="relative bg-zinc-900 rounded border border-zinc-800 p-3">
          <div className="space-y-1.5">
            {rows.map((row) => {
              // Find wall_start relative to hydration
              const qMetrics = csrQueries.filter(
                (q) => q.queryName === row.queryName,
              );
              const wallStarts = qMetrics.map((q) => {
                // wall_start_ms is absolute from request start
                // We want relative to hydration
                return q.boundary_path;
              });
              // Get the boundary metrics for positioning
              const starts = qMetrics.map((q) => {
                // Use duration for width, position from 0
                return 0;
              });

              const widthPct = Math.max(
                (row.durationPctl / maxDuration) * 80,
                8,
              );
              const color = row.subgraphColors[0] ?? "rgb(168, 85, 247)";

              return (
                <div
                  key={row.queryName}
                  className="relative h-7 flex items-center"
                >
                  <div
                    className="h-full rounded flex items-center overflow-hidden"
                    style={{
                      width: `${widthPct}%`,
                      background: `repeating-linear-gradient(
                        135deg,
                        ${color},
                        ${color} 3px,
                        transparent 3px,
                        transparent 6px
                      )`,
                      backgroundColor: color,
                      opacity: 0.85,
                    }}
                  >
                    <span className="text-xs text-white px-1.5 truncate font-mono drop-shadow-sm">
                      {row.queryName} ({row.durationPctl}ms)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Query table */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm font-mono table-fixed"
          style={{ minWidth: "500px" }}
        >
          <thead>
            <tr className="text-zinc-500 text-xs border-b border-zinc-800">
              <th
                className="text-left py-2 px-2 font-normal"
                style={{ width: "28%" }}
              >
                Query
              </th>
              <th
                className="text-left py-2 px-2 font-normal"
                style={{ width: "28%" }}
              >
                Subgraph Ops
              </th>
              <th
                className="text-right py-2 px-2 font-normal"
                style={{ width: "14%" }}
              >
                Duration
                <br />
                <span className="text-zinc-600">{pLabel}</span>
              </th>
              <th
                className="text-right py-2 px-2 font-normal"
                style={{ width: "10%" }}
              >
                SLO
              </th>
              <th
                className="text-center py-2 px-2 font-normal"
                style={{ width: "10%" }}
              >
                Status
              </th>
              <th
                className="py-2 px-2 font-normal"
                style={{ width: "10%" }}
              >
                <span className="sr-only">Bar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.queryName}
                className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
              >
                <td className="py-1.5 px-2 text-zinc-200">
                  {row.queryName}
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex flex-wrap gap-1">
                    {row.operations.map((op, i) => (
                      <span
                        key={op}
                        className="text-xs rounded px-1.5 py-0.5"
                        style={{
                          backgroundColor: `${row.subgraphColors[i]}20`,
                          color: row.subgraphColors[i],
                        }}
                      >
                        {op}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-right py-1.5 px-2 text-zinc-300">
                  {row.durationPctl}ms
                </td>
                <td className="text-right py-1.5 px-2 text-zinc-500">
                  {row.sloMs}ms
                </td>
                <td className="text-center py-1.5 px-2">
                  <span
                    className={`text-xs font-medium ${
                      row.sloStatus === "ok"
                        ? "text-green-400"
                        : row.sloStatus === "warn"
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {row.sloStatus === "ok"
                      ? "OK"
                      : row.sloStatus === "warn"
                        ? "WARN"
                        : "BREACH"}
                  </span>
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex items-center h-4">
                    <div
                      className="h-2.5 rounded-sm"
                      style={{
                        width: `${Math.max(8, (row.durationPctl / maxDuration) * 100)}%`,
                        backgroundColor:
                          row.subgraphColors[0] ?? "rgb(168, 85, 247)",
                        minWidth: "4px",
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
