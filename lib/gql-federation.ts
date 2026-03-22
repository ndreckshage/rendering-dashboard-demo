/**
 * GraphQL Federation simulation configuration.
 *
 * Models a federated GQL architecture where queries fan out to multiple
 * subgraph services. Each subgraph operation has its own latency profile
 * and SLO, and queries group operations at the Suspense boundary level.
 */

// --- Subgraph service definitions ---

export const SUBGRAPHS = {
  "product-subgraph": { color: "rgb(59, 130, 246)", sloMs: 100 }, // blue
  "pricing-subgraph": { color: "rgb(139, 92, 246)", sloMs: 500 }, // violet
  "inventory-subgraph": { color: "rgb(245, 158, 11)", sloMs: 75 }, // amber
  "reviews-subgraph": { color: "rgb(34, 197, 94)", sloMs: 560 }, // green
  "cms-subgraph": { color: "rgb(249, 115, 22)", sloMs: 150 }, // orange
  "reco-subgraph": { color: "rgb(236, 72, 153)", sloMs: 290 }, // pink
  "experimentation-subgraph": { color: "rgb(99, 102, 241)", sloMs: 65 }, // indigo
  "media-subgraph": { color: "rgb(6, 182, 212)", sloMs: 90 }, // cyan
  "user-subgraph": { color: "rgb(168, 85, 247)", sloMs: 150 }, // purple
} as const;

export type SubgraphName = keyof typeof SUBGRAPHS;

// --- Subgraph operation definitions ---

export interface SubgraphOperationDef {
  subgraph: SubgraphName;
  baseMs: number;
  sloMs: number;
}

export const SUBGRAPH_OPERATIONS: Record<string, SubgraphOperationDef> = {
  "product.core": { subgraph: "product-subgraph", baseMs: 45, sloMs: 75 },
  "product.bullets": { subgraph: "product-subgraph", baseMs: 30, sloMs: 65 },
  "product.cards": { subgraph: "product-subgraph", baseMs: 60, sloMs: 100 },
  "pricing.current": { subgraph: "pricing-subgraph", baseMs: 350, sloMs: 500 },
  "pricing.batch": { subgraph: "pricing-subgraph", baseMs: 120, sloMs: 200 },
  "inventory.availability": {
    subgraph: "inventory-subgraph",
    baseMs: 40,
    sloMs: 75,
  },
  "reviews.summary": { subgraph: "reviews-subgraph", baseMs: 50, sloMs: 90 },
  "reviews.list": { subgraph: "reviews-subgraph", baseMs: 350, sloMs: 560 },
  "cms.navigation": { subgraph: "cms-subgraph", baseMs: 90, sloMs: 150 },
  "cms.layout": { subgraph: "cms-subgraph", baseMs: 60, sloMs: 100 },
  "cms.footer": { subgraph: "cms-subgraph", baseMs: 40, sloMs: 75 },
  "reco.personalized": { subgraph: "reco-subgraph", baseMs: 180, sloMs: 290 },
  "experiment.context": {
    subgraph: "experimentation-subgraph",
    baseMs: 30,
    sloMs: 65,
  },
  "media.heroImage": { subgraph: "media-subgraph", baseMs: 35, sloMs: 65 },
  "media.thumbnails": { subgraph: "media-subgraph", baseMs: 50, sloMs: 90 },
  "category.tree": { subgraph: "cms-subgraph", baseMs: 55, sloMs: 100 },
  // Client-side operations (post-hydration)
  "user.cart": { subgraph: "user-subgraph", baseMs: 80, sloMs: 150 },
  "user.favorites": { subgraph: "user-subgraph", baseMs: 60, sloMs: 125 },
  "reviews.qa": { subgraph: "reviews-subgraph", baseMs: 200, sloMs: 375 },
};

// --- GQL query definitions ---

export interface GqlQueryDef {
  operations: string[];
}

export const GQL_QUERIES: Record<string, GqlQueryDef> = {
  getExperimentContext: {
    operations: ["experiment.context"],
  },
  getNavigation: {
    operations: ["cms.navigation"],
  },
  getContentLayout: {
    operations: ["cms.layout"],
  },
  getBreadcrumbs: {
    operations: ["category.tree"],
  },
  getHeroImage: {
    operations: ["media.heroImage"],
  },
  getThumbnails: {
    operations: ["media.thumbnails"],
  },
  // Shared between Title + Bullets + Options boundaries — second/third calls are React cache() hits
  getProductInfo: {
    operations: ["product.core", "product.bullets"],
  },
  getProductPricing: {
    operations: ["pricing.current", "inventory.availability", "reviews.summary"],
  },
  getRecommendations: {
    operations: ["reco.personalized", "product.cards", "pricing.batch"],
  },
  getReviews: {
    operations: ["reviews.list"],
  },
  getFooter: {
    operations: ["cms.footer"],
  },
  // Client-side queries (post-hydration)
  getUserCart: {
    operations: ["user.cart"],
  },
  getUserFavorites: {
    operations: ["user.favorites"],
  },
  getReviewsQA: {
    operations: ["reviews.qa"],
  },
};
