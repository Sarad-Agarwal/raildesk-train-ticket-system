/**
 * Registration page behaviour.
 *
 * The checks follow US_UI_001. Aadhaar is required and is not checked for
 * length or digits. A completed form is stored in localStorage and the person
 * returns to the login page.
 */

import { registerCustomer } from "./auth.js";
import {
  clearFieldError,
  setButtonLoading,
  setFieldError
} from "./common.js";
import {
  validateAadhaar,
  validateConfirmPassword,
  validateEmail,
  validateMobile,
  validatePassword,
  validateUsername
} from "./validation.js";

const form = document.querySelector("#registerForm");
const formAlert = document.querySelector("#formAlert");

const fields = {
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  confirmPassword: document.querySelector("#confirmPassword"),
  email: document.querySelector("#email"),
  mobile: document.querySelector("#mobile"),
  aadhaar: document.querySelector("#aadhaar")
};

/**
 * Shows one message above the registration form.
 *
 * @param {string} message - Text to show. An empty string hides it.
 * @returns {void}
 */
function showFormAlert(message) {
  formAlert.hidden = !message;
  formAlert.textContent = message;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showFormAlert("");

  const checks = [
    [fields.username, validateUsername(fields.username.value)],
    [fields.password, validatePassword(fields.password.value)],
    [fields.confirmPassword, validateConfirmPassword(fields.password.value, fields.confirmPassword.value)],
    [fields.email, validateEmail(fields.email.value)],
    [fields.mobile, validateMobile(fields.mobile.value)],
    [fields.aadhaar, validateAadhaar(fields.aadhaar.value)]
  ];

  let firstInvalid = null;
  checks.forEach(([input, message]) => {
    if (message) {
      setFieldError(input, message);
      firstInvalid = firstInvalid || input;
    } else {
      clearFieldError(input);
    }
  });

  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const submit = form.querySelector("[type='submit']");
  setButtonLoading(submit, true);

  try {
    const result = await registerCustomer({
      username: fields.username.value.trim(),
      password: fields.password.value,
      email: fields.email.value.trim(),
      mobile: fields.mobile.value.trim(),
      aadhaar: fields.aadhaar.value.trim()
    });

    if (!result.ok) {
      setFieldError(fields.username, result.message);
      fields.username.focus();
      setButtonLoading(submit, false);
      return;
    }

    window.location.href = "../index.html?registered=1";
  } catch (error) {
    showFormAlert("The account could not be saved. Open this site with Live Server and try again.");
    setButtonLoading(submit, false);
  }
});
