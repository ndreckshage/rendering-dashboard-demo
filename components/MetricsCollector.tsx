"use client";

import { useEffect, useRef } from "react";
import { clientMetricsStore, type LoAFEntry } from "@/lib/client-metrics-store";
import type {
  BoundaryMetric,
  FetchMetric,
  QueryMetric,
  SubgraphOperationMetric,
} from "@/lib/metrics-store";

interface Props {
  metrics: {
    boundaries: BoundaryMetric[];
    fetches: FetchMetric[];
    queries: QueryMetric[];
    subgraphOps: SubgraphOperationMetric[];
  };
}

/** How long after mount to observe Long Animation Frames (ms) */
const LOAF_OBSERVE_WINDOW_MS = 5000;

/**
 * Client component that persists server-rendered metrics to localStorage
 * and observes Long Animation Frames during page initialization.
 * CSR query simulation is handled by ClientQueryOrchestrator.
 *
 * Rendered inside MetricsEmbed's Suspense boundary, so it only mounts
 * after all boundaries have been recorded and the data has streamed in.
 * Receives metrics directly as a prop — no DOM querying needed.
 */
export function MetricsCollector({ metrics }: Props) {
  const stored = useRef(false);

  useEffect(() => {
    if (stored.current) return;
    if (!metrics?.boundaries?.length) return;

    // Deduplicate: don't re-store if this request is already recorded
    const requestId = metrics.boundaries[0].requestId;
    const existing = clientMetricsStore.getMetrics();
    if (existing.boundaries.some((b) => b.requestId === requestId)) return;

    clientMetricsStore.addPageLoad(metrics);
    stored.current = true;

    // --- Long Animation Frame observer ---
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const loafEntries: LoAFEntry[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            // LoAF entries have scripts attribution
            const loaf = entry as PerformanceEntry & {
              blockingDuration?: number;
              scripts?: ReadonlyArray<{
                sourceURL?: string;
                sourceFunctionName?: string;
                invokerType?: string;
                duration?: number;
              }>;
            };
            loafEntries.push({
              startTime: Math.round(loaf.startTime),
              duration: Math.round(loaf.duration),
              blockingDuration: Math.round(loaf.blockingDuration ?? 0),
              scripts: (loaf.scripts ?? []).map((s) => ({
                sourceURL: s.sourceURL ?? "",
                sourceFunctionName: s.sourceFunctionName ?? "",
                invokerType: s.invokerType ?? "",
                duration: Math.round(s.duration ?? 0),
              })),
            });
          }
        });

        observer.observe({ type: "long-animation-frame", buffered: true });

        // Stop observing after the initialization window
        setTimeout(() => {
          observer.disconnect();
          if (loafEntries.length > 0) {
            clientMetricsStore.appendLoafEntries(requestId, loafEntries);
          }
        }, LOAF_OBSERVE_WINDOW_MS);
      } catch {
        // long-animation-frame not supported in this browser — skip silently
      }
    }
  }, [metrics]);

  return null;
}
