export type BlogCategory = {
  slug: string;
  label: string;
};

export const DEFAULT_BLOG_CATEGORY = "mindset";

export const BLOG_CATEGORIES: BlogCategory[] = [
  { slug: "mindset", label: "Mindset" },
  { slug: "focus", label: "Focus" },
  { slug: "habits", label: "Habits" },
  { slug: "self-improvement", label: "Self Improvement" },
  { slug: "confidence", label: "Confidence" },
  { slug: "mental-toughness", label: "Mental Toughness" },
  { slug: "goal-setting", label: "Goal Setting" },
  { slug: "wealth-mindset", label: "Wealth Mindset" },
  { slug: "business", label: "Business" },
  { slug: "branding", label: "Branding" },
  { slug: "online-income", label: "Online Income" },
  { slug: "discipline", label: "Discipline" },
  { slug: "discipline-systems", label: "Discipline Systems" },
  { slug: "fitness", label: "Fitness" },
  { slug: "fitness-mindset", label: "Fitness Mindset" },
  { slug: "strength", label: "Strength" },
  { slug: "nutrition", label: "Nutrition" },
  { slug: "health", label: "Health" },
  { slug: "entrepreneurship", label: "Entrepreneurship" },
  { slug: "motivation", label: "Motivation" },
  { slug: "motivation-quotes", label: "Motivation Quotes" },
  { slug: "lifestyle", label: "Lifestyle" },
  { slug: "mens-lifestyle", label: "Men's Lifestyle" },
  { slug: "womens-lifestyle", label: "Women's Lifestyle" },
  { slug: "success", label: "Success" },
  { slug: "execution", label: "Execution" },
  { slug: "productivity", label: "Productivity" },
  { slug: "morning-routine", label: "Morning Routine" },
  { slug: "time-management", label: "Time Management" },
  { slug: "personal-growth", label: "Personal Growth" },
  { slug: "leadership", label: "Leadership" },
  { slug: "consistency", label: "Consistency" },
  { slug: "accountability", label: "Accountability" },
  { slug: "life-lessons", label: "Life Lessons" },
  { slug: "performance", label: "Performance" },
  { slug: "work-ethic", label: "Work Ethic" },
  { slug: "purpose", label: "Purpose" },
  { slug: "transformation", label: "Transformation" },
  { slug: "daily-standards", label: "Daily Standards" },
  { slug: "training", label: "Training" },
  { slug: "recovery", label: "Recovery" },
  { slug: "digital-products", label: "Digital Products" },
  { slug: "apparel", label: "Apparel" },
  { slug: "build-level-news", label: "Build Level News" },
  { slug: "build-level-drops", label: "Build Level Drops" },
  { slug: "product-updates", label: "Product Updates" },
  { slug: "customer-stories", label: "Customer Stories" },
  { slug: "guides", label: "Guides" },
  { slug: "challenge", label: "Challenge" },
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
