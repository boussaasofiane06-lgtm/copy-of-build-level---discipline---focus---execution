export type BlogCategory = {
  slug: string;
  label: string;
};

export const DEFAULT_BLOG_CATEGORY = "mindset";

export const BLOG_CATEGORIES: BlogCategory[] = [
  { slug: "mindset", label: "Mindset" },
  { slug: "discipline", label: "Discipline" },
  { slug: "fitness", label: "Fitness" },
  { slug: "entrepreneurship", label: "Entrepreneurship" },
  { slug: "motivation", label: "Motivation" },
  { slug: "lifestyle", label: "Lifestyle" },
  { slug: "success", label: "Success" },
  { slug: "execution", label: "Execution" },
  { slug: "productivity", label: "Productivity" },
  { slug: "training", label: "Training" },
  { slug: "recovery", label: "Recovery" },
  { slug: "digital-products", label: "Digital Products" },
  { slug: "apparel", label: "Apparel" },
  { slug: "build-level-news", label: "Build Level News" },
];

export function slugifyBlogCategory(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getBlogCategoryBySlug(slug?: string | null) {
  return BLOG_CATEGORIES.find((category) => category.slug === slug);
}

export function getBlogCategoryLabel(slug?: string | null) {
  if (!slug) return "Mindset";
  const known = getBlogCategoryBySlug(slug);
  if (known) return known.label;

  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeBlogCategory(value?: string | null) {
  if (!value) return DEFAULT_BLOG_CATEGORY;
  return slugifyBlogCategory(value) || DEFAULT_BLOG_CATEGORY;
}
