/**
 * Shared customer navigation.
 *
 * Every customer page uses the same links. The design-system page is not
 * included. The active page receives aria-current so the current section is clear.
 */

import { clearSession, getSession, loginUrl } from "./auth.js";

const LINKS = [
  { id: "home", href: "customer-dashboard.html", label: "Home" },
  { id: "tickets", href: "view-tickets.html", label: "View Ticket" },
  { id: "details", href: "update-details.html", label: "Update Details" },
  { id: "search", href: "train-search.html", label: "Train Search and Seat Availability" }
];

/**
 * Builds the initials shown beside the signed-in name.
 *
 * @param {string} name - Customer name.
 * @returns {string} One or two letters.
 */
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0] || "C").slice(0, 2).toUpperCase();
}

/**
 * Fills the customer sidebar and wires Log out.
 *
 * @param {string} active - Id of the current page: home, tickets, details, or search.
 * @returns {void}
 */
export function mountCustomerNav(active) {
  const aside = document.querySelector("[data-customer-nav]");
  const session = getSession();
  if (!aside || !session) {
    return;
  }

  const brand = document.createElement("a");
  brand.className = "brand brand--light";
  brand.href = "customer-dashboard.html";
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
  brandTag.textContent = "Customer portal";
  brandText.append(brandName, brandTag);
  brand.append(mark, brandText);

  const nav = document.createElement("nav");
  nav.className = "sidebar__nav";
  nav.setAttribute("aria-label", "Customer");

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
  avatar.textContent = initials(session.name);
  const userText = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = session.name;
  const small = document.createElement("small");
  small.textContent = "Customer";
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
