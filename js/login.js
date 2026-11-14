/**
 * Login page behaviour.
 *
 * US_UI_001 asks for a username and a password, and neither may be empty.
 * The Customer / Admin switch chooses which stored account list is checked.
 * A customer is sent to the customer home. An administrator is sent to the
 * admin dashboard. Each portal then refuses the other role.
 */

import { adminDashboardUrl, clearSession, dashboardUrl, getSession, login } from "./auth.js";
import { prepareStorage } from "./storage.js";
import { clearFieldError, setButtonLoading, setFieldError } from "./common.js";
import { validateRequired } from "./validation.js";

const form = document.querySelector("#loginForm");
const roleButtons = document.querySelectorAll("[data-role]");
const registerLink = document.querySelector("#registerLink");
const formAlert = document.querySelector("#formAlert");

let role = "customer";

/**
 * Shows or hides the message above the form.
 *
 * @param {string} message - Text to show. An empty string hides the message.
 * @param {"error" | "success"} variant - Which alert colour to use.
 * @returns {void}
 */
function showFormAlert(message, variant) {
  formAlert.hidden = !message;
  formAlert.textContent = message;
  formAlert.className = variant === "success" ? "alert alert--success" : "alert alert--error";
}

/**
 * Marks the selected portal and shows the registration link only for customers.
 * Administrators are not registered from this screen.
 *
 * @param {"customer" | "admin"} nextRole - Portal the person wants to enter.
 * @returns {void}
 */
function selectRole(nextRole) {
  role = nextRole;
  roleButtons.forEach((button) => {
    const selected = button.getAttribute("data-role") === nextRole;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  registerLink.hidden = nextRole !== "customer";
}

roleButtons.forEach((button) => {
  button.addEventListener("click", () => selectRole(button.getAttribute("data-role")));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showFormAlert("", "error");

  const username = document.querySelector("#username");
  const password = document.querySelector("#password");
  const usernameError = validateRequired(username.value, "Username");
  const passwordError = validateRequired(password.value, "Password");

  clearFieldError(username);
  clearFieldError(password);

  if (usernameError) {
    setFieldError(username, usernameError);
  }
  if (passwordError) {
    setFieldError(password, passwordError);
  }
  if (usernameError || passwordError) {
    (usernameError ? username : password).focus();
    return;
  }

  const submit = form.querySelector("[type='submit']");
  setButtonLoading(submit, true);

  try {
    const result = await login(role, username.value, password.value);
    if (!result.ok) {
      showFormAlert(result.message, "error");
      setButtonLoading(submit, false);
      return;
    }

    window.location.href = role === "admin" ? adminDashboardUrl() : dashboardUrl();
  } catch (error) {
    showFormAlert("The account list could not be loaded. Open this site with Live Server and try again.", "error");
    setButtonLoading(submit, false);
  }
});

/**
 * Opens the matching home when that role is already signed in.
 * A successful registration returns here with ?registered=1.
 *
 * @returns {Promise<void>}
 */
async function startLoginPage() {
  const justRegistered = new URLSearchParams(window.location.search).get("registered") === "1";
  if (justRegistered) {
    // A new account should sign in itself. Drop any earlier session so the
    // success message stays on this page instead of jumping to the old home.
    clearSession();
    showFormAlert("The account was created. Sign in with the username and password.", "success");
  }

  const session = getSession();
  if (!justRegistered && session && session.role === "customer") {
    window.location.replace(dashboardUrl());
    return;
  }
  if (!justRegistered && session && session.role === "admin") {
    window.location.replace(adminDashboardUrl());
    return;
  }

  try {
    await prepareStorage();
  } catch (error) {
    showFormAlert("The account list could not be loaded. Open this site with Live Server and try again.", "error");
  }
}

startLoginPage();
