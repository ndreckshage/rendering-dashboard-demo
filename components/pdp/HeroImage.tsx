/**
 * LCP hero image — rendered directly in the initial HTML payload (no Suspense).
 * Only the image itself lives here. Product title/description are in a separate
 * Suspense boundary so the image is the only non-skeleton content on first paint.
 */
export function HeroImage() {
  return (
    <div className="px-6 py-6">
      <img
        src="https://picsum.photos/id/250/800/800"
        alt="Nikon D7000 Camera"
        width={800}
        height={800}
        className="bg-zinc-800 rounded-xl aspect-square max-w-lg w-full object-cover"
        fetchPriority="high"
      />
    </div>
  );
}

/**
 * Product summary shown alongside/below the hero image.
 * Rendered inside a Suspense boundary so it doesn't block the hero.
 */
export function ProductSummary({
  product,
}: {
  product: {
    name: string;
    shortDescription: string;
    rating: number;
    reviewCount: number;
  };
}) {
  return (
    <div className="px-6 md:px-0 pb-4">
      <h1 className="text-3xl font-bold text-white mb-3">{product.name}</h1>
      <p className="text-zinc-400 mb-4">{product.shortDescription}</p>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-yellow-400">
          {"★".repeat(Math.round(product.rating))}
          {"☆".repeat(5 - Math.round(product.rating))}
        </span>
        <span className="text-zinc-500">
          {product.rating} ({product.reviewCount.toLocaleString()} reviews)
        </span>
      </div>
    </div>
  );
}
