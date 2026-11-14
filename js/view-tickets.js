/**
 * View Ticket.
 *
 * Lists bookings for the signed-in customer, filters that history, and
 * cancels a confirmed booking without deleting the record.
 */

import { requireCustomer } from "./auth.js";
import { formatClock, formatDisplayDate, openModal, closeModal, showToast } from "./common.js";
import { mountCustomerNav } from "./customer-nav.js";
import { getBookings, prepareStorage, saveBookings } from "./storage.js";

const session = requireCustomer();

/** Booking chosen in the cancel dialog. Null when the dialog is closed. */
let pendingBookingId = null;

/**
 * Returns bookings that belong to the signed-in customer, newest journey first.
 *
 * @returns {Array} This customer's bookings. Other customers are excluded.
 */
function customerBookings() {
  return getBookings()
    .filter((booking) => booking.userId === session.userId)
    .sort((left, right) => {
      const byDate = String(right.journeyDate).localeCompare(String(left.journeyDate));
      if (byDate !== 0) {
        return byDate;
      }
      return String(right.id).localeCompare(String(left.id));
    });
}

/**
 * Reads the current search and filter controls.
 *
 * @returns {{query: string, date: string, trainId: string, status: string}}
 */
function readFilters() {
  return {
    query: document.querySelector("#ticketSearch").value.trim().toLowerCase(),
    date: document.querySelector("#journeyDate").value,
    trainId: document.querySelector("#trainFilter").value,
    status: document.querySelector("#statusFilter").value
  };
}

/**
 * Decides whether one booking matches the search box and the three filters.
 *
 * @param {object} booking - One stored booking.
 * @param {{query: string, date: string, trainId: string, status: string}} filters - Current controls.
 * @returns {boolean} True when the booking should stay in the list.
 */
function matchesFilters(booking, filters) {
  if (filters.query) {
    const haystack = [booking.id, booking.trainId, booking.trainNumber, booking.trainName]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(filters.query)) {
      return false;
    }
  }

  if (filters.date && booking.journeyDate !== filters.date) {
    return false;
  }

  if (filters.trainId && booking.trainId !== filters.trainId) {
    return false;
  }

  if (filters.status && booking.status !== filters.status) {
    return false;
  }

  return true;
}

/**
 * Writes the three summary figures from every booking, including ones hidden by a filter.
 *
 * @param {Array} bookings - This customer's bookings.
 * @returns {void}
 */
function renderSummary(bookings) {
  const confirmed = bookings.filter((booking) => booking.status === "Confirmed").length;
  const cancelled = bookings.filter((booking) => booking.status === "Cancelled").length;
  document.querySelector("#totalBookings").textContent = String(bookings.length);
  document.querySelector("#confirmedBookings").textContent = String(confirmed);
  document.querySelector("#cancelledBookings").textContent = String(cancelled);
}

/**
 * Fills the train filter from this customer's bookings.
 * The current choice is kept when that train is still in the list.
 *
 * @param {Array} bookings - This customer's bookings.
 * @returns {void}
 */
function fillTrainFilter(bookings) {
  const select = document.querySelector("#trainFilter");
  const current = select.value;
  const seen = new Set();

  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All trains";
  select.append(all);

  bookings.forEach((booking) => {
    if (seen.has(booking.trainId)) {
      return;
    }
    seen.add(booking.trainId);
    const option = document.createElement("option");
    option.value = booking.trainId;
    option.textContent = `${booking.trainNumber} · ${booking.trainName}`;
    select.append(option);
  });

  select.value = [...select.options].some((option) => option.value === current) ? current : "";
}

/**
 * Adds one labelled value to a ticket card.
 *
 * @param {HTMLElement} list - Description list on the card.
 * @param {string} label - Field name.
 * @param {string} value - Field value.
 * @param {boolean} [mono=false] - True for ids.
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
 * Builds one ticket card. Cancelled bookings stay visible and cannot be cancelled again.
 *
 * @param {object} booking - Booking that belongs to the signed-in customer.
 * @returns {HTMLElement} The card.
 */
function createTicketCard(booking) {
  const cancelled = booking.status === "Cancelled";
  const card = document.createElement("article");
  card.className = cancelled ? "ticket-card ticket-card--cancelled" : "ticket-card";

  const rail = document.createElement("div");
  rail.className = "ticket-card__rail";
  rail.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "ticket-card__body";

  const top = document.createElement("div");
  top.className = "ticket-card__top";
  const titleWrap = document.createElement("div");
  const number = document.createElement("p");
  number.className = "ticket-card__number";
  number.textContent = booking.trainNumber || "Train";
  const title = document.createElement("h3");
  title.className = "ticket-card__train";
  title.textContent = booking.trainName || "Reserved journey";
  titleWrap.append(number, title);

  const badge = document.createElement("span");
  badge.className = cancelled ? "badge badge--danger" : "badge badge--success";
  badge.textContent = booking.status || "Confirmed";
  top.append(titleWrap, badge);

  const route = document.createElement("div");
  route.className = "ticket-card__route";
  const from = document.createElement("div");
  const fromPlace = document.createElement("p");
  fromPlace.className = "ticket-card__place";
  fromPlace.textContent = booking.boardingStation;
  const fromWhen = document.createElement("p");
  fromWhen.className = "ticket-card__when";
  fromWhen.textContent = `${formatDisplayDate(booking.journeyDate)} · ${formatClock(booking.boardingTime)}`;
  from.append(fromPlace, fromWhen);

  const arrow = document.createElement("div");
  arrow.className = "ticket-card__arrow";
  arrow.setAttribute("aria-hidden", "true");

  const to = document.createElement("div");
  const toPlace = document.createElement("p");
  toPlace.className = "ticket-card__place";
  toPlace.textContent = booking.destinationStation;
  const toWhen = document.createElement("p");
  toWhen.className = "ticket-card__when";
  toWhen.textContent = `${formatDisplayDate(booking.arrivalDate)} · ${formatClock(booking.arrivalTime)}`;
  to.append(toPlace, toWhen);
  route.append(from, arrow, to);

  const details = document.createElement("dl");
  details.className = "meta-list";
  addDetail(details, "Ticket ID", booking.id, true);
  addDetail(details, "Train ID", booking.trainId, true);
  addDetail(details, "User ID", booking.userId, true);
  addDetail(details, "User name", booking.userName || session.name);
  addDetail(details, "Number of tickets", String(booking.ticketCount));
  addDetail(details, "Ticket category", booking.category || "—");

  const actions = document.createElement("div");
  actions.className = "ticket-card__actions";
  if (cancelled) {
    const note = document.createElement("p");
    note.className = "ticket-card__when";
    note.textContent = "This booking is kept in your history.";
    actions.append(note);
  } else {
    const cancel = document.createElement("button");
    cancel.className = "btn btn--danger";
    cancel.type = "button";
    cancel.textContent = "Cancel ticket";
    cancel.addEventListener("click", () => askToCancel(booking.id));
    actions.append(cancel);
  }

  body.append(top, route, details, actions);
  card.append(rail, body);
  return card;
}

/**
 * Shows the empty history, or the message used when filters hide every booking.
 *
 * @param {HTMLElement} list - Container that holds the cards.
 * @param {boolean} accountIsEmpty - True when this customer has no bookings at all.
 * @returns {void}
 */
function showEmpty(list, accountIsEmpty) {
  const article = document.createElement("article");
  article.className = "card";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const title = document.createElement("h3");
  title.className = "empty-state__title";
  const text = document.createElement("p");
  text.className = "empty-state__text";

  if (accountIsEmpty) {
    title.textContent = "No tickets yet";
    text.textContent = "Bookings for this account will appear here with the train, journey, and status.";
    const link = document.createElement("a");
    link.className = "btn btn--primary";
    link.href = "train-search.html";
    link.textContent = "Search trains";
    empty.append(title, text, link);
  } else {
    title.textContent = "No tickets match these filters";
    text.textContent = "Try another booking ID, train, date, or status.";
    const reset = document.createElement("button");
    reset.className = "btn btn--secondary";
    reset.type = "button";
    reset.textContent = "Reset filters";
    reset.addEventListener("click", resetFilters);
    empty.append(title, text, reset);
  }

  article.append(empty);
  list.append(article);
}

/**
 * Draws the summary and the bookings that match the current filters.
 *
 * @returns {void}
 */
function renderTickets() {
  const bookings = customerBookings();
  renderSummary(bookings);
  fillTrainFilter(bookings);

  const filters = readFilters();
  const visible = bookings.filter((booking) => matchesFilters(booking, filters));
  const list = document.querySelector("#ticketList");
  list.replaceChildren();

  if (!visible.length) {
    showEmpty(list, bookings.length === 0);
    return;
  }

  visible.forEach((booking) => list.append(createTicketCard(booking)));
}

/**
 * Clears every filter and shows the full history again.
 *
 * @returns {void}
 */
function resetFilters() {
  document.querySelector("#ticketSearch").value = "";
  document.querySelector("#journeyDate").value = "";
  document.querySelector("#trainFilter").value = "";
  document.querySelector("#statusFilter").value = "";
  renderTickets();
  document.querySelector("#ticketSearch").focus();
}

/**
 * Opens the confirmation dialog for one confirmed booking.
 *
 * @param {string} bookingId - Ticket id shown on the card.
 * @returns {void}
 */
function askToCancel(bookingId) {
  const booking = customerBookings().find((item) => item.id === bookingId);
  if (!booking || booking.status === "Cancelled") {
    return;
  }

  pendingBookingId = booking.id;
  document.querySelector("#cancelSummary").textContent =
    `${booking.id}: ${booking.trainNumber} ${booking.trainName}, ${booking.boardingStation} to ${booking.destinationStation}, ${formatDisplayDate(booking.journeyDate)} at ${formatClock(booking.boardingTime)}.`;
  openModal("cancelModal");
}

/**
 * Marks the chosen booking Cancelled and refreshes the list.
 * The record stays in localStorage.
 *
 * @returns {void}
 */
function confirmCancellation() {
  const bookingId = pendingBookingId;
  pendingBookingId = null;

  const bookings = getBookings();
  const booking = bookings.find((item) => item.id === bookingId && item.userId === session.userId);

  if (!booking || booking.status === "Cancelled") {
    closeModal("cancelModal");
    showToast("This ticket is already cancelled.", "error");
    renderTickets();
    return;
  }

  booking.status = "Cancelled";
  saveBookings(bookings);
  closeModal("cancelModal");
  renderTickets();
  showToast(`${booking.id} was cancelled. The booking remains in your history.`);
}

/**
 * Loads this customer's bookings and wires search, filters, and cancellation.
 *
 * @returns {Promise<void>}
 */
async function startViewTickets() {
  if (!session) {
    return;
  }

  mountCustomerNav("tickets");

  try {
    await prepareStorage();
  } catch (error) {
    document.querySelector("#pageAlert").hidden = false;
    document.querySelector("#pageAlert").textContent = "Bookings could not be loaded. Open this site with Live Server.";
    return;
  }

  document.querySelector("#filterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    renderTickets();
  });
  document.querySelector("#ticketSearch").addEventListener("input", renderTickets);
  document.querySelector("#journeyDate").addEventListener("change", renderTickets);
  document.querySelector("#trainFilter").addEventListener("change", renderTickets);
  document.querySelector("#statusFilter").addEventListener("change", renderTickets);
  document.querySelector("#resetFilters").addEventListener("click", resetFilters);
  document.querySelector("#cancelModal").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) {
      pendingBookingId = null;
    }
  });
  document.querySelector("#confirmCancel").addEventListener("click", confirmCancellation);
  renderTickets();
}

startViewTickets();
