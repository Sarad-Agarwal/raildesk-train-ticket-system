/**
 * Demonstration sign-in for the customer and admin portals.
 *
 * The session lives in sessionStorage and ends when the tab closes, or when
 * the user chooses Log out. It records who is signed in. It does not make
 * the stored passwords secure.
 */

import { getAdmins, getCustomers, prepareStorage, saveCustomers } from "./storage.js";

const SESSION_KEY = "raildesk_session";

/**
 * Reads the person currently signed in.
 *
 * @returns {{role: string, userId: string, username: string, name: string} | null}
 * The session object, or null when nobody is signed in.
 */
export function getSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!session || !session.role || !session.userId) {
      return null;
    }
    return session;
  } catch (error) {
    return null;
  }
}

/**
 * Stores the signed-in person for this browser tab.
 *
 * @param {{role: string, userId: string, username: string, name: string}} session - Portal, id, and display name.
 * @returns {void}
 */
export function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Removes the signed-in person. Saved bookings are not removed.
 *
 * @returns {void}
 */
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Finds the login page from either the site root or a page inside /pages.
 *
 * @returns {string} Relative URL of the login page.
 */
export function loginUrl() {
  return window.location.pathname.replace(/\\/g, "/").includes("/pages/")
    ? "../index.html"
    : "index.html";
}

/**
 * Finds the customer home from either the site root or a page inside /pages.
 *
 * @returns {string} Relative URL of the customer home.
 */
export function dashboardUrl() {
  return window.location.pathname.replace(/\\/g, "/").includes("/pages/")
    ? "customer-dashboard.html"
    : "pages/customer-dashboard.html";
}

/**
 * Finds the admin home from either the site root or a page inside /pages.
 *
 * @returns {string} Relative URL of the admin dashboard.
 */
export function adminDashboardUrl() {
  return window.location.pathname.replace(/\\/g, "/").includes("/pages/")
    ? "admin-dashboard.html"
    : "pages/admin-dashboard.html";
}

/**
 * Sends a visitor who is not a signed-in customer away from a customer page.
 * An administrator is sent to the admin dashboard. Everyone else goes to login.
 *
 * @returns {{role: string, userId: string, username: string, name: string} | null}
 * The customer session. The function navigates away when the check fails.
 */
export function requireCustomer() {
  const session = getSession();
  if (!session) {
    window.location.replace(loginUrl());
    return null;
  }
  if (session.role !== "customer") {
    window.location.replace(adminDashboardUrl());
    return null;
  }
  return session;
}

/**
 * Sends a visitor who is not a signed-in administrator away from an admin page.
 * A customer is sent to the customer home. Everyone else goes to login.
 *
 * @returns {{role: string, userId: string, username: string, name: string} | null}
 * The admin session. The function navigates away when the check fails.
 */
export function requireAdmin() {
  const session = getSession();
  if (!session) {
    window.location.replace(loginUrl());
    return null;
  }
  if (session.role !== "admin") {
    window.location.replace(dashboardUrl());
    return null;
  }
  return session;
}

/**
 * Checks a customer or admin username and password.
 * The comparison is exact. Usernames are matched without regard to letter case.
 *
 * @param {"customer" | "admin"} role - Portal selected on the login page.
 * @param {string} username - Entered username.
 * @param {string} password - Entered password.
 * @returns {Promise<{ok: boolean, message: string}>} Whether sign-in succeeded.
 */
export async function login(role, username, password) {
  await prepareStorage();
  const name = username.trim().toLowerCase();
  const records = role === "admin" ? getAdmins() : getCustomers();
  const account = records.find((person) => person.username.toLowerCase() === name);

  if (!account || account.password !== password) {
    return { ok: false, message: "The username or password is not correct." };
  }

  setSession({
    role,
    userId: account.id,
    username: account.username,
    name: account.name || account.username
  });

  return { ok: true, message: "" };
}

/**
 * Adds a customer and rejects a username that is already registered.
 *
 * @param {object} customer - Customer fields collected on the registration page.
 * @returns {Promise<{ok: boolean, message: string}>} Whether the account was stored.
 */
export async function registerCustomer(customer) {
  await prepareStorage();
  const customers = getCustomers();
  const taken = customers.some((person) => person.username.toLowerCase() === customer.username.toLowerCase());

  if (taken) {
    return { ok: false, message: "That username is already registered." };
  }

  const nextNumber = 1000 + customers.length + 1;
  customers.push({
    id: `CUS-${nextNumber}`,
    username: customer.username,
    password: customer.password,
    email: customer.email,
    mobile: customer.mobile,
    aadhaar: customer.aadhaar,
    address: "",
    name: customer.username
  });
  saveCustomers(customers);
  return { ok: true, message: "" };
}
