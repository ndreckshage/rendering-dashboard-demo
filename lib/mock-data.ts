import { sleep } from "./sleep";

/**
 * Simulates a fetch with realistic latency variance.
 * Adds ±20% jitter to the base latency.
 */
export async function simulatedFetch<T>(
  baseMs: number,
  data: T
): Promise<T> {
  const jitter = baseMs * 0.4 * (Math.random() - 0.5);
  const actualMs = Math.max(10, Math.round(baseMs + jitter));
  await sleep(actualMs);
  return data;
}

// --- Mock data generators ---

export function mockNavData() {
  return {
    categories: [
      { name: "Electronics", href: "/c/electronics" },
      { name: "Computers", href: "/c/computers" },
      { name: "Cameras", href: "/c/cameras" },
      { name: "Accessories", href: "/c/accessories" },
    ],
    logo: "ACME Store",
  };
}

export function mockSessionConfig() {
  return {
    userId: "usr_abc123",
    featureFlags: { newCheckout: true, darkMode: true },
  };
}

export function mockProductData(sku: string) {
  return {
    sku,
    name: "Nikon D7000 Digital Camera",
    brand: "Nikon",
    heroImageUrl: "/placeholder-hero.svg",
    shortDescription:
      "16.2MP DX-format CMOS sensor with 1080p video and 39-point AF system.",
    rating: 4.6,
    reviewCount: 1247,
  };
}

export function mockBreadcrumbs() {
  return [
    { name: "Home", href: "/" },
    { name: "Electronics", href: "/c/electronics" },
    { name: "Cameras", href: "/c/cameras" },
    { name: "DSLR", href: "/c/dslr" },
  ];
}

export function mockProductDetails() {
  return {
    price: 899.99,
    originalPrice: 1199.99,
    currency: "USD",
    inStock: true,
    variants: [
      { name: "Body Only", value: "body", available: true },
      { name: "18-105mm Kit", value: "kit-18-105", available: true },
      { name: "18-200mm Kit", value: "kit-18-200", available: false },
    ],
    specs: [
      { label: "Sensor", value: "16.2MP DX CMOS" },
      { label: "ISO Range", value: "100–25600" },
      { label: "AF Points", value: "39-point" },
      { label: "Weight", value: "780g" },
    ],
  };
}

export function mockCarousels() {
  return {
    title: "You might also like",
    items: Array.from({ length: 8 }, (_, i) => ({
      id: `rec-${i}`,
      name: `Product ${i + 1}`,
      price: Math.round(49.99 + Math.random() * 200),
      imageUrl: `/placeholder-rec-${i}.svg`,
      rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
    })),
  };
}

export function mockReviews() {
  const reviewTexts = [
    "Incredible image quality. Sharp and vibrant even in low light.",
    "The autofocus is lightning fast. Perfect for action shots.",
    "Great build quality — feels solid and weather-sealed.",
    "Video mode is excellent. 1080p looks fantastic.",
    "Ergonomics are perfect. Comfortable to shoot all day.",
    "Best value DSLR in this class. Highly recommend.",
  ];
  return {
    summary: { average: 4.6, total: 1247, distribution: [5, 62, 23, 7, 3] },
    reviews: reviewTexts.map((text, i) => ({
      id: `rev-${i}`,
      author: `User${1000 + i}`,
      rating: Math.min(5, 3 + Math.floor(Math.random() * 3)),
      text,
      date: new Date(Date.now() - i * 86400000 * 3).toISOString(),
      helpful: Math.floor(Math.random() * 50),
    })),
  };
}

export function mockFooterData() {
  return {
    columns: [
      {
        title: "Shop",
        links: ["All Products", "Deals", "New Arrivals", "Best Sellers"],
      },
      {
        title: "Support",
        links: ["Contact Us", "FAQ", "Returns", "Shipping"],
      },
      {
        title: "Company",
        links: ["About", "Careers", "Press", "Blog"],
      },
    ],
    copyright: "2026 ACME Store. All rights reserved.",
  };
}
