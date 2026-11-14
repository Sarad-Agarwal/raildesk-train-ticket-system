/**
 * Shared admin navigation.
 *
 * The design-system page is not included. Log out removes the session and
 * returns to the login page.
 */

import { clearSession, getSession, loginUrl } from "./auth.js";

const LINKS = [
  { id: "home", href: "admin-dashboard.html", label: "Home" },
  { id: "register", href: "register-train.html", label: "Register a Train" },
  { id: "profile", href: "admin-profile.html", label: "Admin Profile" }
];

/**
 * Builds the initials shown beside the signed-in name.
 *
 * @param {string} name - Administrator name or username.
 * @returns {string} One or two letters.
 */
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0] || "A").slice(0, 2).toUpperCase();
}

/**
 * Fills the admin sidebar and wires Log out.
 *
 * @param {string} active - Id of the current page: "home", "register", or "profile".
 * @returns {void}
 */
export function mountAdminNav(active) {
  const aside = document.querySelector("[data-admin-nav]");
  const session = getSession();
  if (!aside || !session || session.role !== "admin") {
    return;
  }

  const brand = document.createElement("a");
  brand.className = "brand brand--light";
  brand.href = "admin-dashboard.html";
  const mark = document.createElement("img");
  mark.className = "brand__mark";
  mark.src = "../assets/mark.svg";
  mark.alt = "";
  const brandText = document.createElement("span");
  const brandName = document.createElement("span");
  brandName.className = "brand__name";
  brandName.textContent = "RailDesk";
  const brandTag = document.createElement("span");
  brandTag.className = "brand__tag";
  brandTag.textContent = "Admin portal";
  brandText.append(brandName, brandTag);
  brand.append(mark, brandText);

  const nav = document.createElement("nav");
  nav.className = "sidebar__nav";
  nav.setAttribute("aria-label", "Admin");

  LINKS.forEach((item) => {
    const link = document.createElement("a");
    link.className = item.id === active ? "sidebar__link is-active" : "sidebar__link";
    link.href = item.href;
    link.textContent = item.label;
    if (item.id === active) {
      link.setAttribute("aria-current", "page");
    }
    nav.append(link);
  });

  const footer = document.createElement("div");
  footer.className = "sidebar__footer";
  const user = document.createElement("div");
  user.className = "sidebar__user";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = initials(session.name || session.username);
  const userText = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = session.name || session.username;
  const small = document.createElement("small");
  small.textContent = "Administrator";
  userText.append(strong, small);
  user.append(avatar, userText);

  const logout = document.createElement("button");
  logout.className = "btn btn--ghost";
  logout.type = "button";
  logout.textContent = "Log out";
  logout.addEventListener("click", () => {
    clearSession();
    window.location.href = loginUrl();
  });

  footer.append(user, logout);
  aside.replaceChildren(brand, nav, footer);
}
