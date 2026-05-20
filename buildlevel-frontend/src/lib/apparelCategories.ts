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
  { audience: "mens", slug: "mens-hoodies", label: "Hoodies" },
  { audience: "mens", slug: "mens-joggers", label: "Joggers" },
  { audience: "mens", slug: "mens-compression-shirts", label: "Compression Shirts" },
  { audience: "mens", slug: "mens-tank-tops", label: "Tank Tops" },
  { audience: "mens", slug: "mens-streetwear", label: "Streetwear" },
  { audience: "mens", slug: "mens-gym-essentials", label: "Gym Essentials" },

  { audience: "womens", slug: "womens-crop-tops", label: "Crop Tops" },
  { audience: "womens", slug: "womens-leggings", label: "Leggings" },
  { audience: "womens", slug: "womens-sports-bras", label: "Sports Bras" },
  { audience: "womens", slug: "womens-skirts", label: "Skirts" },
  { audience: "womens", slug: "womens-oversized-tees", label: "Oversized Tees" },
  { audience: "womens", slug: "womens-streetwear", label: "Women's Streetwear" },

  { audience: "kids", slug: "kids-hoodies", label: "Kids Hoodies" },
  { audience: "kids", slug: "kids-joggers", label: "Kids Joggers" },
  { audience: "kids", slug: "kids-t-shirts", label: "Kids T-Shirts" },
  { audience: "kids", slug: "kids-sets", label: "Kids Sets" },
  { audience: "kids", slug: "kids-accessories", label: "Kids Accessories" },
];

export const DEFAULT_AUDIENCE: ApparelAudience = "mens";
export const DEFAULT_CATEGORY = "mens-hoodies";

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
  return getCategoryBySlug(slug)?.audience ?? DEFAULT_AUDIENCE;
}

export function getKnownAudienceForCategory(slug?: string | null): ApparelAudience | null {
  return getCategoryBySlug(slug)?.audience ?? null;
}

export function getCategoryLabel(slug?: string | null) {
  const category = getCategoryBySlug(slug);
  if (category) return category.label;
  if (!slug) return "Uncategorized";

  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getCategoryAudienceLabel(slug?: string | null) {
  const category = getCategoryBySlug(slug);
  return category ? getAudienceLabel(category.audience) : "Legacy";
}
