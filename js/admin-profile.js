/**
 * Admin profile.
 *
 * Loads the signed-in administrator and saves username, password, mobile
 * number, and email. The session is updated so the sidebar shows the new
 * username before the next sign-in.
 */

import { requireAdmin, setSession } from "./auth.js";
import { clearFieldError, setFieldError, showToast } from "./common.js";
import { mountAdminNav } from "./admin-nav.js";
import { getAdmins, prepareStorage, saveAdmins } from "./storage.js";
import {
  validateConfirmPassword,
  validateEmail,
  validateMobile,
  validatePassword,
  validateUsername
} from "./validation.js";

const session = requireAdmin();

/**
 * Finds the signed-in administrator.
 *
 * @returns {object | null}
 */
function currentAdmin() {
  return getAdmins().find((person) => person.id === session.userId) || null;
}

/**
 * Copies the stored account into the form, including the current password.
 *
 * @param {object} admin - Administrator record.
 * @returns {void}
 */
function fillProfile(admin) {
  document.querySelector("#username").value = admin.username || "";
  document.querySelector("#password").value = admin.password || "";
  document.querySelector("#confirmPassword").value = admin.password || "";
  document.querySelector("#mobile").value = admin.mobile || "";
  document.querySelector("#email").value = admin.email || "";
}

/**
 * Checks the profile against the registration rules.
 * The username may stay the same. Another administrator cannot already have it.
 *
 * @param {object} admin - The account being edited.
 * @returns {HTMLElement | null} The first invalid field, or null when the form can be saved.
 */
function validateProfile(admin) {
  const username = document.querySelector("#username");
  const password = document.querySelector("#password");
  const confirm = document.querySelector("#confirmPassword");
  const mobile = document.querySelector("#mobile");
  const email = document.querySelector("#email");

  let usernameMessage = validateUsername(username.value);
  const typedName = username.value.trim().toLowerCase();
  const taken = getAdmins().some((person) => person.id !== admin.id && person.username.toLowerCase() === typedName);
  if (!usernameMessage && taken) {
    usernameMessage = "That username is already registered.";
  }

  const fields = [
    [username, usernameMessage],
    [password, validatePassword(password.value)],
    [confirm, validateConfirmPassword(password.value, confirm.value)],
    [mobile, validateMobile(mobile.value)],
    [email, validateEmail(email.value)]
  ];

  let firstInvalid = null;
  fields.forEach(([input, message]) => {
    if (message) {
      setFieldError(input, message);
      firstInvalid = firstInvalid || input;
    } else {
      clearFieldError(input);
    }
  });
  return firstInvalid;
}

/**
 * Saves the administrator and refreshes the signed-in session.
 *
 * @param {SubmitEvent} event - Profile form submission.
 * @returns {void}
 */
function saveProfile(event) {
  event.preventDefault();
  const admins = getAdmins();
  const admin = admins.find((person) => person.id === session.userId);
  if (!admin) {
    showToast("This account could not be found.", "error");
    return;
  }

  const firstInvalid = validateProfile(admin);
  if (firstInvalid) {
    firstInvalid.focus();
    showToast("Check the highlighted fields.", "error");
    return;
  }

  admin.username = document.querySelector("#username").value.trim();
  admin.password = document.querySelector("#password").value;
  admin.mobile = document.querySelector("#mobile").value.trim();
  admin.email = document.querySelector("#email").value.trim();
  saveAdmins(admins);

  setSession({
    role: "admin",
    userId: admin.id,
    username: admin.username,
    name: admin.username
  });
  mountAdminNav("profile");
  showToast("Your admin details were saved.");
}

/**
 * Opens the profile form for the signed-in administrator.
 *
 * @returns {Promise<void>}
 */
async function startAdminProfile() {
  if (!session) {
    return;
  }

  mountAdminNav("profile");

  try {
    await prepareStorage();
  } catch (error) {
    const alert = document.querySelector("#pageAlert");
    alert.hidden = false;
    alert.textContent = "Administrator data could not be loaded. Open this site with Live Server.";
    return;
  }

  const admin = currentAdmin();
  if (!admin) {
    const alert = document.querySelector("#pageAlert");
    alert.hidden = false;
    alert.textContent = "This administrator account could not be found.";
    return;
  }

  fillProfile(admin);
  document.querySelector("#profileForm").addEventListener("submit", saveProfile);
}

startAdminProfile();
