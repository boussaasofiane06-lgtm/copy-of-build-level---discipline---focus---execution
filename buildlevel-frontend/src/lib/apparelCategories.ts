export type ApparelAudience = "mens" | "womens" | "kids";

export type ApparelCategory = {
  slug: string;
  label: string;
  audience: ApparelAudience;
};

export const APPAREL_AUDIENCES: Array<{ value: ApparelAudience; label: string }> = [
  { value: "mens", label: "Men's" },
  { value: "womens", label: "Women's" },
  { value: "kids", label: "Kids" },
];

export const APPAREL_CATEGORIES: ApparelCategory[] = [
  { audience: "mens", slug: "mens-t-shirts", label: "T-Shirts" },
  { audience: "mens", slug: "mens-hoodies", label: "Hoodies" },
  { audience: "mens", slug: "mens-joggers", label: "Joggers" },
  { audience: "mens", slug: "mens-tank-tops", label: "Tank Tops" },
  { audience: "mens", slug: "mens-shorts", label: "Shorts" },
  { audience: "mens", slug: "mens-hats", label: "Hats" },
  { audience: "mens", slug: "mens-compression-wear", label: "Compression Wear" },
  { audience: "mens", slug: "mens-compression-shirts", label: "Compression Shirts" },
  { audience: "mens", slug: "mens-performance-tees", label: "Performance Tees" },
  { audience: "mens", slug: "mens-training-tops", label: "Training Tops" },
  { audience: "mens", slug: "mens-long-sleeves", label: "Long Sleeves" },
  { audience: "mens", slug: "mens-sweatshirts", label: "Sweatshirts" },
  { audience: "mens", slug: "mens-jackets", label: "Jackets" },
  { audience: "mens", slug: "mens-pants", label: "Pants" },
  { audience: "mens", slug: "mens-accessories", label: "Accessories" },
  { audience: "mens", slug: "mens-greeting-cards", label: "Greeting Cards" },
  { audience: "mens", slug: "mens-stickers", label: "Stickers" },
  { audience: "mens", slug: "mens-posters", label: "Posters" },
  { audience: "mens", slug: "mens-home-office", label: "Home & Office" },
  { audience: "mens", slug: "mens-drinkware", label: "Drinkware" },
  { audience: "mens", slug: "mens-bags", label: "Bags" },
  { audience: "mens", slug: "mens-limited-drops", label: "Limited Drops" },
  { audience: "mens", slug: "mens-seasonal", label: "Seasonal" },
  { audience: "mens", slug: "mens-streetwear", label: "Streetwear" },
  { audience: "mens", slug: "mens-gym-essentials", label: "Gym Essentials" },

  { audience: "womens", slug: "womens-t-shirts", label: "T-Shirts" },
  { audience: "womens", slug: "womens-crop-tops", label: "Crop Tops" },
  { audience: "womens", slug: "womens-hoodies", label: "Hoodies" },
  { audience: "womens", slug: "womens-leggings", label: "Leggings" },
  { audience: "womens", slug: "womens-shorts", label: "Shorts" },
  { audience: "womens", slug: "womens-sports-bras", label: "Sports Bras" },
  { audience: "womens", slug: "womens-hats", label: "Hats" },
  { audience: "womens", slug: "womens-skirts", label: "Skirts" },
  { audience: "womens", slug: "womens-oversized-tees", label: "Oversized Tees" },
  { audience: "womens", slug: "womens-tank-tops", label: "Tank Tops" },
  { audience: "womens", slug: "womens-training-tops", label: "Training Tops" },
  { audience: "womens", slug: "womens-long-sleeves", label: "Long Sleeves" },
  { audience: "womens", slug: "womens-sweatshirts", label: "Sweatshirts" },
  { audience: "womens", slug: "womens-jackets", label: "Jackets" },
  { audience: "womens", slug: "womens-joggers", label: "Joggers" },
  { audience: "womens", slug: "womens-compression-wear", label: "Compression Wear" },
  { audience: "womens", slug: "womens-accessories", label: "Accessories" },
  { audience: "womens", slug: "womens-greeting-cards", label: "Greeting Cards" },
  { audience: "womens", slug: "womens-stickers", label: "Stickers" },
  { audience: "womens", slug: "womens-posters", label: "Posters" },
  { audience: "womens", slug: "womens-home-office", label: "Home & Office" },
  { audience: "womens", slug: "womens-drinkware", label: "Drinkware" },
  { audience: "womens", slug: "womens-bags", label: "Bags" },
  { audience: "womens", slug: "womens-limited-drops", label: "Limited Drops" },
  { audience: "womens", slug: "womens-seasonal", label: "Seasonal" },
  { audience: "womens", slug: "womens-streetwear", label: "Women's Streetwear" },

  { audience: "kids", slug: "kids-t-shirts", label: "Kids T-Shirts" },
  { audience: "kids", slug: "kids-hoodies", label: "Kids Hoodies" },
  { audience: "kids", slug: "kids-joggers", label: "Kids Joggers" },
  { audience: "kids", slug: "kids-shorts", label: "Kids Shorts" },
  { audience: "kids", slug: "kids-hats", label: "Kids Hats" },
  { audience: "kids", slug: "kids-sweatshirts", label: "Kids Sweatshirts" },
  { audience: "kids", slug: "kids-long-sleeves", label: "Kids Long Sleeves" },
  { audience: "kids", slug: "kids-jackets", label: "Kids Jackets" },
  { audience: "kids", slug: "kids-performance", label: "Kids Performance" },
  { audience: "kids", slug: "kids-sets", label: "Kids Sets" },
  { audience: "kids", slug: "kids-accessories", label: "Kids Accessories" },
  { audience: "kids", slug: "kids-greeting-cards", label: "Kids Greeting Cards" },
  { audience: "kids", slug: "kids-stickers", label: "Kids Stickers" },
  { audience: "kids", slug: "kids-posters", label: "Kids Posters" },
  { audience: "kids", slug: "kids-home-office", label: "Kids Home & Office" },
  { audience: "kids", slug: "kids-drinkware", label: "Kids Drinkware" },
  { audience: "kids", slug: "kids-bags", label: "Kids Bags" },
  { audience: "kids", slug: "kids-limited-drops", label: "Kids Limited Drops" },
  { audience: "kids", slug: "kids-seasonal", label: "Kids Seasonal" },
];

export const DEFAULT_AUDIENCE: ApparelAudience = "mens";
export const DEFAULT_CATEGORY = "mens-t-shirts";

export const STOREFRONT_CATEGORY_PRIORITY: Record<ApparelAudience, string[]> = {
  mens: ["mens-t-shirts", "mens-performance-tees", "mens-hoodies", "mens-joggers", "mens-tank-tops", "mens-shorts", "mens-hats", "mens-accessories", "mens-greeting-cards", "mens-limited-drops"],
  womens: ["womens-t-shirts", "womens-crop-tops", "womens-hoodies", "womens-leggings", "womens-shorts", "womens-sports-bras", "womens-hats", "womens-accessories", "womens-greeting-cards", "womens-limited-drops"],
  kids: ["kids-t-shirts", "kids-hoodies", "kids-joggers", "kids-shorts", "kids-hats", "kids-sets", "kids-accessories", "kids-greeting-cards", "kids-limited-drops"],
};

export function slugifyCategory(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createCustomCategorySlug(audience: ApparelAudience, label: string) {
  const slug = slugifyCategory(label);
  return slug ? `${audience}-${slug}` : getCategoriesForAudience(audience)[0]?.slug || DEFAULT_CATEGORY;
}

export function getCategoriesForAudience(audience: ApparelAudience) {
  return APPAREL_CATEGORIES.filter((category) => category.audience === audience);
}

export function getCategoryBySlug(slug?: string | null) {
  return APPAREL_CATEGORIES.find((category) => category.slug === slug);
}

export function getAudienceLabel(audience: ApparelAudience) {
  return APPAREL_AUDIENCES.find((item) => item.value === audience)?.label ?? "Apparel";
}

export function getAudienceForCategory(slug?: string | null): ApparelAudience {
  return getKnownAudienceForCategory(slug) ?? DEFAULT_AUDIENCE;
}

export function getKnownAudienceForCategory(slug?: string | null): ApparelAudience | null {
  const known = getCategoryBySlug(slug)?.audience;
  if (known) return known;
  if (!slug) return null;
  if (slug.startsWith("mens-")) return "mens";
  if (slug.startsWith("womens-")) return "womens";
  if (slug.startsWith("kids-")) return "kids";
  return null;
}

export function getCategoryLabel(slug?: string | null) {
  const category = getCategoryBySlug(slug);
  if (category) return category.label;
  if (!slug) return "Uncategorized";
  const audience = getKnownAudienceForCategory(slug);
  const normalizedSlug = audience ? slug.replace(`${audience}-`, "") : slug;

  return normalizedSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getCategoryAudienceLabel(slug?: string | null) {
  const audience = getKnownAudienceForCategory(slug);
  return audience ? getAudienceLabel(audience) : "Legacy";
}
