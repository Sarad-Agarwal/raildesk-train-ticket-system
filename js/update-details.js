/**
 * Update Details.
 *
 * Loads the signed-in customer and saves email, mobile number, and address.
 * A separate section changes the demonstration password after the current
 * password is checked.
 */

import { requireCustomer } from "./auth.js";
import { clearFieldError, setFieldError, showToast } from "./common.js";
import { mountCustomerNav } from "./customer-nav.js";
import { getCustomers, prepareStorage, saveCustomers } from "./storage.js";
import {
  validateConfirmPassword,
  validateEmail,
  validateMobile,
  validatePassword,
  validateRequired
} from "./validation.js";

const session = requireCustomer();

/**
 * Finds the signed-in customer in the stored account list.
 *
 * @returns {object | null} The customer record, or null when the id is missing.
 */
function currentCustomer() {
  return getCustomers().find((customer) => customer.id === session.userId) || null;
}

/**
 * Copies the stored account into the personal-information form.
 *
 * @param {object} customer - Customer record for the signed-in person.
 * @returns {void}
 */
function fillProfile(customer) {
  document.querySelector("#profileName").value = customer.name || session.name || "";
  document.querySelector("#profileUsername").value = customer.username || session.username || "";
  document.querySelector("#email").value = customer.email || "";
  document.querySelector("#mobile").value = customer.mobile || "";
  document.querySelector("#address").value = customer.address || "";
}

/**
 * Checks email, mobile number, and address.
 *
 * @returns {HTMLElement | null} The first invalid field, or null when the form can be saved.
 */
function validateProfile() {
  const fields = [
    [document.querySelector("#email"), validateEmail(document.querySelector("#email").value)],
    [document.querySelector("#mobile"), validateMobile(document.querySelector("#mobile").value)],
    [document.querySelector("#address"), validateRequired(document.querySelector("#address").value, "Address")]
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
 * Saves email, mobile number, and address on the signed-in customer only.
 *
 * @param {SubmitEvent} event - Personal-information form submission.
 * @returns {void}
 */
function saveProfile(event) {
  event.preventDefault();
  const firstInvalid = validateProfile();
  if (firstInvalid) {
    firstInvalid.focus();
    showToast("Check the highlighted fields.", "error");
    return;
  }

  const customers = getCustomers();
  const customer = customers.find((person) => person.id === session.userId);
  if (!customer) {
    showToast("This account could not be found.", "error");
    return;
  }

  customer.email = document.querySelector("#email").value.trim();
  customer.mobile = document.querySelector("#mobile").value.trim();
  customer.address = document.querySelector("#address").value.trim();
  saveCustomers(customers);
  showToast("Your details were saved.");
}

/**
 * Shows or hides the password form.
 *
 * @returns {void}
 */
function togglePasswordPanel() {
  const panel = document.querySelector("#passwordPanel");
  const button = document.querySelector("#showPasswordPanel");
  const willOpen = panel.hidden;
  panel.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
  button.textContent = willOpen ? "Hide password form" : "Update password";
  if (willOpen) {
    document.querySelector("#currentPassword").focus();
  }
}

/**
 * Returns a password field to its hidden state and clears its message.
 *
 * @param {string} id - Input id.
 * @returns {void}
 */
function resetPasswordField(id) {
  const input = document.getElementById(id);
  input.value = "";
  input.type = "password";
  clearFieldError(input);
  const toggle = document.querySelector(`[data-password-toggle="${id}"]`);
  if (toggle) {
    toggle.setAttribute("aria-pressed", "false");
    toggle.textContent = "Show";
  }
}

/**
 * Checks the current password and the new password pair.
 *
 * @param {object} customer - Stored account, used for the current password.
 * @returns {HTMLElement | null} The first invalid field, or null when the password can change.
 */
function validatePasswordChange(customer) {
  const current = document.querySelector("#currentPassword");
  const next = document.querySelector("#newPassword");
  const confirm = document.querySelector("#confirmPassword");
  const fields = [
    [current, current.value ? "" : "Current password is required."],
    [next, validatePassword(next.value)],
    [confirm, validateConfirmPassword(next.value, confirm.value)]
  ];

  if (current.value && current.value !== customer.password) {
    fields[0][1] = "Current password is not correct.";
  }

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
 * Replaces the stored password when the current password and the new rules pass.
 *
 * @param {SubmitEvent} event - Password form submission.
 * @returns {void}
 */
function savePassword(event) {
  event.preventDefault();
  const customers = getCustomers();
  const customer = customers.find((person) => person.id === session.userId);
  if (!customer) {
    showToast("This account could not be found.", "error");
    return;
  }

  const firstInvalid = validatePasswordChange(customer);
  if (firstInvalid) {
    firstInvalid.focus();
    showToast("The password was not changed.", "error");
    return;
  }

  customer.password = document.querySelector("#newPassword").value;
  saveCustomers(customers);
  ["currentPassword", "newPassword", "confirmPassword"].forEach(resetPasswordField);
  showToast("Password updated. Use it the next time you sign in.");
}

/**
 * Loads the signed-in customer and wires both forms.
 *
 * @returns {Promise<void>}
 */
async function startUpdateDetails() {
  if (!session) {
    return;
  }

  mountCustomerNav("details");

  try {
    await prepareStorage();
  } catch (error) {
    document.querySelector("#pageAlert").hidden = false;
    document.querySelector("#pageAlert").textContent = "Account details could not be loaded. Open this site with Live Server.";
    return;
  }

  const customer = currentCustomer();
  if (!customer) {
    document.querySelector("#pageAlert").hidden = false;
    document.querySelector("#pageAlert").textContent = "This account could not be found.";
    return;
  }

  fillProfile(customer);
  document.querySelector("#profileForm").addEventListener("submit", saveProfile);
  document.querySelector("#passwordForm").addEventListener("submit", savePassword);
  document.querySelector("#showPasswordPanel").addEventListener("click", togglePasswordPanel);
}

startUpdateDetails();
