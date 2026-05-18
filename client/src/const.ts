export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// This site uses password-based admin auth, not OAuth.
// getLoginUrl is kept for compatibility but redirects to the admin page.
export const getLoginUrl = () => {
  return "/admin";
};
