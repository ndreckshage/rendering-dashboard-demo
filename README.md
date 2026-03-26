# Suspense Dash

Performance dashboard for React Suspense + GraphQL Federation. Visualizes how Suspense boundaries, queries, and subgraph operations interact during SSR/CSR page loads.

Uses a simulated ecommerce PDP with 14 Suspense boundaries and 9 federated subgraphs — entirely self-contained, no external dependencies. The instrumentation approach is designed to adapt to real applications.

## Getting Started

```bash
bun install
bun dev
```

Visit `/products/demo-sku` to generate live metrics, then `/dashboard` to visualize. Or import a YAML performance profile directly from the dashboard.

## Dashboard

Three tabs, all supporting percentile selection (p50–p99):

- **Suspense Waterfall** — SSR/CSR boundary execution timeline with LCP, hydration, and LoAF markers
- **Component Tree** — Boundary → query → subgraph hierarchy with latency, SLO status, and memoization tracking
- **Subgraph Calls** — Per-service call counts, latency, and caller breakdown

## Data Architecture

All components consume `DashboardData` (`lib/dashboard-types.ts`) — pre-computed views keyed by percentile. Two sources converge on this shape:

```
Live metrics:  Product page → TracedBoundary → MetricsEmbed → localStorage
               → convertLiveMetrics() → DashboardData

YAML import:   YAML file → parseYamlDashboard() → DashboardData

               DashboardData → CriticalInitPath | BoundaryTreeTable | SubgraphCallsTab
```

**Live path**: Each page load records `BoundaryMetric`, `QueryMetric`, and `SubgraphOperationMetric` samples. `convertLiveMetrics()` selects a representative page load at each percentile for the waterfall and computes percentile aggregates for tree/subgraph views.

**YAML path**: `parseYamlDashboard()` converts declared performance profiles into the same shape. The waterfall uses a "fudging" algorithm where the highest-variance query drives page time while others stay near p50.

## YAML Schema

The YAML format models a page's performance profile with three sections. See `public/example-page.yaml` for a full example.

```yaml
route: /products/[sku]

# Query definitions: latency percentiles + subgraph op weights
queries:
  getProductPricing:
    slo: 500
    latency: { p50: 200, p75: 260, p90: 350, p95: 500, p99: 680 }
    ops:
      pricing-subgraph: 0.85    # proportional weight (0–1)
      inventory-subgraph: 0.15
      reviews-subgraph: 0.10

# Subgraph service definitions: SLO + service-wide latency
subgraphs:
  pricing-subgraph:
    slo: 500
    latency: { p75: 180, p90: 300, p95: 450, p99: 620 }

# Boundary tree: references queries by name
boundaries:
  Layout:
    render_cost: 6
    lcp_critical: true
    queries:
      - getExperimentContext
      - name: getProductInfo
        prefetch: true            # fires fetch without suspending
    Content:
      Main.Pricing:
        render_cost: 8
        queries:
          - getProductPricing
      Main.Title:
        queries:
          - name: getProductInfo
            memoized: true        # React cache() dedup from parent
```

**Key concepts:**
- **Query latency** — end-to-end percentiles per GraphQL query (e.g. from Datadog)
- **Op weights** — proportional subgraph contribution (0–1) from Apollo/trace data
- **Subgraph latency** — service-wide percentiles per subgraph, independent of queries
- **prefetch** — boundary fires the query but doesn't suspend; descendants benefit from the head start
- **memoized** — React `cache()` deduplication; reuses result from prior execution of same query

## Simulated PDP

14 Suspense boundaries in a realistic hierarchy, each wrapped in `TracedBoundary` which measures wall start, fetch duration (async I/O), render cost (sync CPU), and blocked time (thread contention).

9 subgraphs with realistic tail latency distributions (85% tight cluster, 11% moderate, 3.5% slow, 0.5% extreme). Query dedup via React `cache()` — e.g. `getProductInfo` called by Title, Bullets, and Options but executes once.

**Slow Mode**: Toggle via nav bar or `?slow=1` — multiplies all latencies by 20x to observe Suspense streaming.

## Key Files

| File | Purpose |
| --- | --- |
| `lib/dashboard-types.ts` | Canonical `DashboardData` types |
| `lib/yaml-import.ts` | YAML → DashboardData |
| `lib/live-metrics-to-mock.ts` | Live metrics → DashboardData |
| `app/dashboard/dashboard-client.tsx` | Dashboard orchestrator |
| `components/dashboard/*` | Tab components (pure renderers of DashboardData) |
| `components/TracedBoundary.tsx` | Boundary instrumentation |
| `components/MetricsEmbed.tsx` | Server → client metrics transport |
| `lib/gql-federation.ts` | Subgraph/query definitions + latency models |
| `public/example-page.yaml` | Example YAML performance profile |
