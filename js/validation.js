/**
 * Field checks for registration, login, and the customer booking form.
 *
 * Each function returns an empty string when the value is acceptable, and a
 * short message when it is not. Pages use that message with setFieldError.
 *
 * Aadhaar follows the Word document only: the value must not be empty.
 * No length or digit rule is applied.
 */

/**
 * Removes surrounding spaces so an empty-looking value is treated as empty.
 *
 * @param {string} value - Text from a form control.
 * @returns {string} The trimmed text.
 */
function tidy(value) {
  return String(value ?? "").trim();
}

/**
 * Checks that a login or booking value was entered.
 *
 * @param {string} value - Text from a form control.
 * @param {string} label - Field name used in the message.
 * @returns {string} An error message, or an empty string when the value is present.
 */
export function validateRequired(value, label) {
  if (!tidy(value)) {
    return `${label} is required.`;
  }
  return "";
}

/**
 * Checks a new username against US_UI_001.
 * It must be present, at least 6 characters, and contain only letters.
 *
 * @param {string} value - Username entered on the registration page.
 * @returns {string} An error message, or an empty string when the username is valid.
 */
export function validateUsername(value) {
  const username = tidy(value);
  if (!username) {
    return "Username is required.";
  }
  if (username.length < 6) {
    return "Username must be at least 6 characters.";
  }
  if (!/^[A-Za-z]+$/.test(username)) {
    return "Username cannot contain numbers or special characters.";
  }
  return "";
}

/**
 * Checks a new password against US_UI_001.
 * It must be at least 8 characters and include one uppercase letter,
 * one number, and one special character.
 *
 * @param {string} value - Password entered by the user. Spaces are kept.
 * @returns {string} An error message, or an empty string when the password is valid.
 */
export function validatePassword(value) {
  const password = String(value ?? "");
  if (!password) {
    return "Password is required.";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain at least one special character.";
  }
  return "";
}

/**
 * Checks that the confirmation matches the password and is not empty.
 *
 * @param {string} password - Original password.
 * @param {string} confirmation - Confirm-password field.
 * @returns {string} An error message, or an empty string when the two values match.
 */
export function validateConfirmPassword(password, confirmation) {
  if (!String(confirmation ?? "")) {
    return "Confirm password is required.";
  }
  if (password !== confirmation) {
    return "Confirm password must match the password.";
  }
  return "";
}

/**
 * Checks an email against US_UI_001.
 * It must contain one @ and a domain with a dot, such as gmail.com.
 *
 * @param {string} value - Email address.
 * @returns {string} An error message, or an empty string when the email is valid.
 */
export function validateEmail(value) {
  const email = tidy(value);
  if (!email) {
    return "Email is required.";
  }
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes(".")) {
    return "Email must contain @ and a domain such as gmail.com.";
  }
  return "";
}

/**
 * Checks a mobile number against US_UI_001.
 * Letters are rejected, and the value must be exactly 10 digits.
 *
 * @param {string} value - Mobile number.
 * @returns {string} An error message, or an empty string when the number is valid.
 */
export function validateMobile(value) {
  const mobile = tidy(value);
  if (!mobile) {
    return "Mobile number is required.";
  }
  if (/[A-Za-z]/.test(mobile)) {
    return "Mobile number cannot contain letters.";
  }
  if (!/^[0-9]{10}$/.test(mobile)) {
    return "Mobile number must be 10 digits.";
  }
  return "";
}

/**
 * Checks Aadhaar exactly as written in the Word document.
 * The field must not be empty. No format or length rule is added.
 *
 * @param {string} value - Aadhaar number.
 * @returns {string} An error message, or an empty string when a value is present.
 */
export function validateAadhaar(value) {
  if (!tidy(value)) {
    return "Aadhaar number is required.";
  }
  return "";
}

/**
 * Checks a passenger age entered on the booking form.
 * The document requires the field. A non-number cannot be stored as an age.
 *
 * @param {string} value - Age typed by the passenger.
 * @returns {string} An error message, or an empty string when the age is a positive whole number.
 */
export function validateAge(value) {
  const age = tidy(value);
  if (!age) {
    return "Age is required.";
  }
  if (!/^[1-9][0-9]*$/.test(age)) {
    return "Age must be a whole number.";
  }
  return "";
}

/**
 * Checks the number of tickets on the customer home booking form.
 *
 * @param {string} value - Ticket count.
 * @returns {string} An error message, or an empty string when the count is at least 1.
 */
export function validateTicketCount(value) {
  const count = tidy(value);
  if (!count) {
    return "Number of tickets is required.";
  }
  if (!/^[1-9][0-9]*$/.test(count)) {
    return "Number of tickets must be a whole number of at least 1.";
  }
  return "";
}

/**
 * Checks a journey date and rejects dates before today.
 *
 * @param {string} value - Date in yyyy-mm-dd form.
 * @returns {string} An error message, or an empty string when the date can be booked.
 */
export function validateJourneyDate(value) {
  const date = tidy(value);
  if (!date) {
    return "Date is required.";
  }
  if (date < todayIso()) {
    return "Date cannot be earlier than today.";
  }
  return "";
}

/**
 * Builds today's date in local time as yyyy-mm-dd.
 * Local time is used so the comparison does not shift across midnight UTC.
 *
 * @returns {string} Today's date.
 */
export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
