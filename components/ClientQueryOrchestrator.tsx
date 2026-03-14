"use client";

import { useEffect, useRef } from "react";
import { simulateCsrQueries } from "@/lib/csr-simulation";
import { clientMetricsStore } from "@/lib/client-metrics-store";

interface Props {
  requestId: string;
  requestStartTs: number;
}

/**
 * Invisible client component that simulates post-hydration GraphQL queries.
 *
 * Fires on mount (= hydration), records timing metrics relative to the
 * original SSR request start, then persists CSR metrics to localStorage.
 */
export function ClientQueryOrchestrator({ requestId, requestStartTs }: Props) {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const hydrationMs = Date.now() - requestStartTs;

    simulateCsrQueries(requestId, requestStartTs, hydrationMs).then(
      (result) => {
        clientMetricsStore.appendCsrMetrics(requestId, result);
      },
    );
  }, [requestId, requestStartTs]);

  return null;
}
