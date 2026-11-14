/**
 * Booking confirmation for the customer home form.
 *
 * The page reads the booking id from the address and shows that booking only
 * when it belongs to the signed-in customer.
 */

import { requireCustomer } from "./auth.js";
import { formatClock, formatDisplayDate, formatInr, getQueryParam } from "./common.js";
import { mountCustomerNav } from "./customer-nav.js";
import { getBookings, prepareStorage } from "./storage.js";

const session = requireCustomer();

/**
 * Adds one row to the confirmation summary.
 *
 * @param {HTMLElement} list - Description list that holds the summary.
 * @param {string} label - Field name.
 * @param {string} value - Field value.
 * @param {boolean} [mono=false] - True for ids that should use the monospace face.
 * @returns {void}
 */
function addDetail(list, label, value, mono = false) {
  const wrap = document.createElement("div");
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  if (mono) {
    detail.className = "mono";
  }
  wrap.append(term, detail);
  list.append(wrap);
}

/**
 * Shows the booking created by the home form, or a message when it cannot be found.
 *
 * @returns {Promise<void>}
 */
async function startConfirmation() {
  if (!session) {
    return;
  }

  mountCustomerNav("home");

  try {
    await prepareStorage();
  } catch (error) {
    document.querySelector("#missing").hidden = false;
    document.querySelector("#missingText").textContent = "Booking data could not be loaded. Open this site with Live Server.";
    return;
  }

  const bookingId = getQueryParam("booking");
  const booking = getBookings().find((item) => item.id === bookingId && item.userId === session.userId);
  if (!booking) {
    document.querySelector("#missing").hidden = false;
    return;
  }

  document.querySelector("#confirmation").hidden = false;
  document.querySelector("#bookingId").textContent = booking.id;

  const arrivalNote = booking.arrivalDate === booking.journeyDate ? "" : ` · ${formatDisplayDate(booking.arrivalDate)}`;
  const list = document.querySelector("#details");
  addDetail(list, "Booking ID", booking.id, true);
  addDetail(list, "Train ID", booking.trainId, true);
  addDetail(list, "Train", `${booking.trainNumber} ${booking.trainName}`);
  addDetail(list, "Passenger", booking.passengerName);
  addDetail(list, "User ID", booking.userId, true);
  addDetail(list, "Mobile", booking.mobile);
  addDetail(list, "Age", String(booking.age));
  addDetail(list, "Boarding", `${booking.boardingStation} · ${formatDisplayDate(booking.journeyDate)} · ${formatClock(booking.boardingTime)}`);
  addDetail(list, "Destination", `${booking.destinationStation} · ${formatClock(booking.arrivalTime)}${arrivalNote}`);
  addDetail(list, "Ticket category", booking.category);
  addDetail(list, "Number of tickets", String(booking.ticketCount));
  addDetail(list, "Total fare", formatInr(booking.fare));
  addDetail(list, "Status", booking.status);
}

startConfirmation();
