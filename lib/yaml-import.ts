/**
 * YAML-to-ClientMetrics transformer.
 *
 * Parses a human-friendly YAML file describing a page's Suspense boundary
 * tree and converts it into the ClientMetrics format consumed by the dashboard.
 * All scheduling (wall_start_ms, blocked_ms) is computed automatically from
 * the declared fetch/render durations.
 */

import { parse as parseYaml } from "yaml";
import type {
  BoundaryMetric,
  QueryMetric,
  SubgraphOperationMetric,
} from "./metrics-store";
import type { ClientMetrics, NavigationTiming } from "./client-metrics-store";
import { SUBGRAPH_OPERATIONS } from "./gql-federation";

// ---- YAML schema types ----

interface YamlOp {
  duration: number;
  cached?: boolean;
}

interface YamlQuery {
  ops: Record<string, number | YamlOp>;
}

interface YamlBoundary {
  fetch?: number;
  render_cost?: number;
  lcp_critical?: boolean;
  queries?: Record<string, YamlQuery>;
  [key: string]: unknown;
}

interface YamlPage {
  route: string;
  percentile?: number;
  hydration_ms?: number;
  navigation_timing?: {
    dom_interactive: number;
    dom_content_loaded: number;
    load_event: number;
    tbt: number;
    loaf_count: number;
  };
  boundaries: Record<string, YamlBoundary>;
  csr_boundaries?: Record<string, YamlBoundary>;
}

// Reserved keys that are boundary properties, not child boundary names
const RESERVED_KEYS = new Set([
  "fetch",
  "render_cost",
  "lcp_critical",
  "queries",
]);

// ---- Scheduling simulation ----

interface ScheduleResult {
  boundaries: BoundaryMetric[];
  queries: QueryMetric[];
  subgraphOps: SubgraphOperationMetric[];
}

function resolveSubgraph(opName: string): string {
  const known = SUBGRAPH_OPERATIONS[opName];
  if (known) return known.subgraph;
  // Support "subgraph-name/opName" syntax for unknown ops
  const slashIdx = opName.indexOf("/");
  if (slashIdx > 0) return opName.slice(0, slashIdx);
  return "unknown-subgraph";
}

function resolveOpName(rawName: string): string {
  // Strip "subgraph-name/" prefix if present for the operation name
  const slashIdx = rawName.indexOf("/");
  if (slashIdx > 0) return rawName.slice(slashIdx + 1);
  return rawName;
}

function getChildBoundaries(
  node: YamlBoundary,
): Record<string, YamlBoundary> {
  const children: Record<string, YamlBoundary> = {};
  for (const [key, value] of Object.entries(node)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Check it looks like a boundary (has at least one boundary-like property
      // or has child boundaries itself). Skip if it's a queries-like structure.
      children[key] = value as YamlBoundary;
    }
  }
  return children;
}

function scheduleBoundary(
  name: string,
  node: YamlBoundary,
  parentPath: string,
  parentFetchEndMs: number,
  threadAvailableMs: number,
  requestId: string,
  timestamp: number,
  route: string,
  phase: "ssr" | "csr",
  result: ScheduleResult,
): number {
  const boundaryPath = parentPath ? `${parentPath}.${name}` : name;
  const fetchMs = node.fetch ?? 0;
  const renderCostMs = node.render_cost ?? 1;

  const fetchStartMs = parentFetchEndMs;
  const fetchEndMs = fetchStartMs + fetchMs;
  const renderStartMs = Math.max(fetchEndMs, threadAvailableMs);
  const blockedMs = Math.max(0, renderStartMs - fetchEndMs);

  const boundaryMetric: BoundaryMetric = {
    timestamp: timestamp + fetchStartMs,
    requestId,
    route,
    boundary_path: boundaryPath,
    wall_start_ms: fetchStartMs,
    render_duration_ms: fetchMs + renderCostMs,
    fetch_duration_ms: fetchMs,
    render_cost_ms: renderCostMs,
    blocked_ms: blockedMs,
    is_lcp_critical: node.lcp_critical ?? false,
    phase,
  };
  result.boundaries.push(boundaryMetric);

  // Process queries
  if (node.queries) {
    for (const [queryName, query] of Object.entries(node.queries)) {
      const subgraphOpNames: string[] = [];
      const cachedOpNames: string[] = [];

      for (const [rawOpName, opValue] of Object.entries(query.ops)) {
        const opName = resolveOpName(rawOpName);
        const subgraphName = resolveSubgraph(rawOpName);
        let durationMs: number;
        let cached = false;

        if (typeof opValue === "number") {
          durationMs = opValue;
        } else {
          durationMs = opValue.duration;
          cached = opValue.cached ?? false;
        }

        const opMetric: SubgraphOperationMetric = {
          timestamp: timestamp + fetchStartMs,
          requestId,
          route,
          boundary_path: boundaryPath,
          queryName,
          operationName: opName,
          subgraphName,
          duration_ms: durationMs,
          cached,
          phase,
        };
        result.subgraphOps.push(opMetric);
        subgraphOpNames.push(opName);
        if (cached) cachedOpNames.push(opName);
      }

      const opDurations = Object.values(query.ops).map((v) =>
        typeof v === "number" ? v : v.duration,
      );
      const queryDuration = Math.max(0, ...opDurations);

      const queryMetric: QueryMetric = {
        timestamp: timestamp + fetchStartMs,
        requestId,
        route,
        boundary_path: boundaryPath,
        queryName,
        duration_ms: queryDuration,
        subgraphOps: subgraphOpNames,
        cachedOps: cachedOpNames,
        fullyCached: cachedOpNames.length === subgraphOpNames.length && subgraphOpNames.length > 0,
        phase,
      };
      result.queries.push(queryMetric);
    }
  }

  // Schedule children: fetches start concurrently after this boundary's fetch,
  // but renders are serial on the main thread
  let childThread = renderStartMs + renderCostMs;
  const children = getChildBoundaries(node);
  for (const [childName, childNode] of Object.entries(children)) {
    childThread = scheduleBoundary(
      childName,
      childNode,
      boundaryPath,
      fetchEndMs, // children fetch after parent fetch completes
      childThread, // renders queue on thread
      requestId,
      timestamp,
      route,
      phase,
      result,
    );
  }

  return childThread;
}

// ---- Main entry point ----

export function parseYamlDashboard(yamlString: string): ClientMetrics {
  const doc = parseYaml(yamlString) as YamlPage;

  if (!doc || typeof doc !== "object") {
    throw new Error("Invalid YAML: expected a document object");
  }
  if (!doc.route) {
    throw new Error("YAML must have a 'route' field");
  }
  if (!doc.boundaries || typeof doc.boundaries !== "object") {
    throw new Error("YAML must have a 'boundaries' section");
  }

  const requestId = crypto.randomUUID();
  const timestamp = Date.now();
  const route = doc.route;

  const result: ScheduleResult = {
    boundaries: [],
    queries: [],
    subgraphOps: [],
  };

  // Schedule SSR boundaries
  let threadMs = 0;
  for (const [name, node] of Object.entries(doc.boundaries)) {
    threadMs = scheduleBoundary(
      name,
      node,
      "",
      0,
      threadMs,
      requestId,
      timestamp,
      route,
      "ssr",
      result,
    );
  }

  // Schedule CSR boundaries
  if (doc.csr_boundaries) {
    const hydrationMs = doc.hydration_ms ?? threadMs;
    let csrThread = hydrationMs;
    for (const [name, node] of Object.entries(doc.csr_boundaries)) {
      csrThread = scheduleBoundary(
        name,
        node,
        "csr",
        hydrationMs,
        csrThread,
        requestId,
        timestamp,
        route,
        "csr",
        result,
      );
    }
  }

  // Build ClientMetrics
  const metrics: ClientMetrics = {
    boundaries: result.boundaries,
    fetches: [],
    queries: result.queries,
    subgraphOps: result.subgraphOps,
    totalPageLoads: 1,
  };

  // Hydration time
  if (doc.hydration_ms != null) {
    metrics.hydrationTimes = { [requestId]: doc.hydration_ms };
  }

  // Navigation timing
  if (doc.navigation_timing) {
    const nt = doc.navigation_timing;
    const navTiming: NavigationTiming = {
      domInteractive: nt.dom_interactive,
      domContentLoaded: nt.dom_content_loaded,
      loadEvent: nt.load_event,
      tbt: nt.tbt,
      loafCount: nt.loaf_count,
    };
    metrics.navigationTimings = { [requestId]: navTiming };
  }

  return metrics;
}
