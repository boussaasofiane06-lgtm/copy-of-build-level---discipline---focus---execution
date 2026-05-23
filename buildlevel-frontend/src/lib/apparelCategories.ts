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
  { audience: "womens", slug: "womens-streetwear", label: "Women's Streetwear" },

  { audience: "kids", slug: "kids-t-shirts", label: "Kids T-Shirts" },
  { audience: "kids", slug: "kids-hoodies", label: "Kids Hoodies" },
  { audience: "kids", slug: "kids-joggers", label: "Kids Joggers" },
  { audience: "kids", slug: "kids-shorts", label: "Kids Shorts" },
  { audience: "kids", slug: "kids-hats", label: "Kids Hats" },
  { audience: "kids", slug: "kids-sets", label: "Kids Sets" },
  { audience: "kids", slug: "kids-accessories", label: "Kids Accessories" },
];

export const DEFAULT_AUDIENCE: ApparelAudience = "mens";
export const DEFAULT_CATEGORY = "mens-t-shirts";

export const STOREFRONT_CATEGORY_PRIORITY: Record<ApparelAudience, string[]> = {
  mens: ["mens-t-shirts", "mens-hoodies", "mens-joggers", "mens-tank-tops", "mens-shorts", "mens-hats"],
  womens: ["womens-t-shirts", "womens-crop-tops", "womens-hoodies", "womens-leggings", "womens-shorts", "womens-sports-bras", "womens-hats"],
  kids: ["kids-t-shirts", "kids-hoodies", "kids-joggers", "kids-shorts", "kids-hats"],
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
