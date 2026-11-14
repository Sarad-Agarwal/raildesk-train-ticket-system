/**
 * Admin home, US_UI_003.
 *
 * Class totals and quarterly sales use every stored booking. Cancelled
 * bookings are left out of both figures. The customer table counts tickets
 * for each account and asks for confirmation before that account is removed.
 */

import { requireAdmin } from "./auth.js";
import { closeModal, formatInr, openModal, showToast } from "./common.js";
import { mountAdminNav } from "./admin-nav.js";
import { getBookings, getCustomers, prepareStorage, saveCustomers } from "./storage.js";

/** Classes named on the customer booking form. */
const CATEGORIES = ["First Class", "AC Tier 1", "AC Tier 2", "Tatkal"];

const session = requireAdmin();
let pendingCustomerId = null;

/**
 * Returns the calendar quarter, from 1 to 4, for a journey date.
 *
 * @param {string} isoDate - yyyy-mm-dd date.
 * @returns {number} Quarter number.
 */
function quarterOf(isoDate) {
  const month = Number(String(isoDate || "").slice(5, 7));
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * Counts tickets in one class. Cancelled bookings are not included.
 *
 * @param {Array} bookings - Bookings for every customer.
 * @param {string} category - Ticket class.
 * @returns {number}
 */
function ticketsInClass(bookings, category) {
  return bookings.reduce((sum, booking) => {
    if (booking.category !== category || booking.status === "Cancelled") {
      return sum;
    }
    return sum + (Number(booking.ticketCount) || 0);
  }, 0);
}

/**
 * Counts tickets held by one customer. Cancelled bookings are not included.
 *
 * @param {Array} bookings - Bookings for every customer.
 * @param {string} customerId - Customer id such as CUS-1008.
 * @returns {number}
 */
function ticketsForCustomer(bookings, customerId) {
  return bookings.reduce((sum, booking) => {
    if (booking.userId !== customerId || booking.status === "Cancelled") {
      return sum;
    }
    return sum + (Number(booking.ticketCount) || 0);
  }, 0);
}

/**
 * Draws ticket totals for each class from the stored bookings.
 *
 * @param {Array} bookings - Bookings for every customer.
 * @returns {void}
 */
function renderClassTotals(bookings) {
  const counts = CATEGORIES.map((category) => ticketsInClass(bookings, category));
  const grid = document.querySelector("#classStats");
  const chart = document.querySelector("#classChart");
  grid.replaceChildren();
  chart.replaceChildren();

  const largest = Math.max(...counts, 1);
  CATEGORIES.forEach((category, index) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    const label = document.createElement("p");
    label.className = "stat-card__label";
    label.textContent = category;
    const value = document.createElement("p");
    value.className = "stat-card__value";
    value.textContent = String(counts[index]);
    card.append(label, value);
    grid.append(card);

    const row = document.createElement("div");
    row.className = "bar-chart__row";
    const name = document.createElement("span");
    name.className = "bar-chart__label";
    name.textContent = category;
    const track = document.createElement("span");
    track.className = "bar-chart__track";
    const fill = document.createElement("span");
    fill.className = "bar-chart__fill";
    fill.style.width = `${(counts[index] / largest) * 100}%`;
    track.append(fill);
    const total = document.createElement("span");
    total.className = "bar-chart__value";
    total.textContent = String(counts[index]);
    row.append(name, track, total);
    chart.append(row);
  });
}

/**
 * Draws this year's sales by quarter. The amount is the stored fare.
 * Cancelled bookings are not included.
 *
 * @param {Array} bookings - Bookings for every customer.
 * @returns {void}
 */
function renderQuarterlySales(bookings) {
  const year = new Date().getFullYear();
  const totals = [0, 0, 0, 0];

  bookings.forEach((booking) => {
    if (booking.status === "Cancelled" || !String(booking.journeyDate || "").startsWith(String(year))) {
      return;
    }
    const quarter = quarterOf(booking.journeyDate);
    if (quarter >= 1 && quarter <= 4) {
      totals[quarter - 1] += Number(booking.fare) || 0;
    }
  });

  const chart = document.querySelector("#quarterChart");
  const largest = Math.max(...totals, 1);
  chart.replaceChildren();
  chart.setAttribute("aria-label", `Sales in ${year}. ${totals.map((amount, index) => `Q${index + 1} ${formatInr(amount)}`).join(", ")}.`);

  totals.forEach((amount, index) => {
    const item = document.createElement("div");
    item.className = "column-chart__item";
    const value = document.createElement("span");
    value.className = "column-chart__value";
    value.textContent = formatInr(amount);
    const plot = document.createElement("div");
    plot.className = "column-chart__plot";
    const bar = document.createElement("span");
    bar.className = "column-chart__bar";
    bar.style.height = `${Math.max((amount / largest) * 100, amount ? 8 : 0)}%`;
    plot.append(bar);
    const label = document.createElement("span");
    label.className = "column-chart__label";
    label.textContent = `Q${index + 1}`;
    item.append(value, plot, label);
    chart.append(item);
  });

  document.querySelector("#salesTitle").textContent = `Sales in ${year}`;
}

/**
 * Fills the customer table. Ticket counts come from that customer's bookings.
 *
 * @param {Array} customers - Registered customers.
 * @param {Array} bookings - Bookings for every customer.
 * @returns {void}
 */
function renderCustomers(customers, bookings) {
  const body = document.querySelector("#customerRows");
  body.replaceChildren();

  if (!customers.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No customers are registered.";
    row.append(cell);
    body.append(row);
    return;
  }

  customers.forEach((customer) => {
    const row = document.createElement("tr");
    const name = customer.name || customer.username;
    const values = [
      customer.id,
      name,
      customer.mobile || "",
      String(ticketsForCustomer(bookings, customer.id))
    ];

    values.forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 0) {
        cell.className = "mono";
      }
      row.append(cell);
    });

    const action = document.createElement("td");
    const button = document.createElement("button");
    button.className = "btn btn--danger";
    button.type = "button";
    button.dataset.deleteCustomer = customer.id;
    button.textContent = "Delete";
    button.setAttribute("aria-label", `Delete ${customer.id} ${name}`);
    action.append(button);
    row.append(action);
    body.append(row);
  });
}

/**
 * Opens the confirmation dialog for one customer.
 *
 * @param {string} customerId - Customer id from the Delete button.
 * @returns {void}
 */
function askToDelete(customerId) {
  const customer = getCustomers().find((person) => person.id === customerId);
  if (!customer) {
    showToast("This customer could not be found.", "error");
    return;
  }

  pendingCustomerId = customer.id;
  const name = customer.name || customer.username;
  document.querySelector("#deleteSummary").textContent = `${customer.id}: ${name}, ${customer.mobile || "no mobile number"}. ${ticketsForCustomer(getBookings(), customer.id)} ticket(s) booked.`;
  openModal("deleteModal");
}

/**
 * Removes the confirmed customer from storage and refreshes the table.
 * Booking records are kept, so class totals and quarterly sales do not change.
 *
 * @returns {void}
 */
function confirmDelete() {
  const customers = getCustomers();
  const index = customers.findIndex((person) => person.id === pendingCustomerId);
  if (index < 0) {
    pendingCustomerId = null;
    closeModal("deleteModal");
    showToast("This customer could not be found.", "error");
    return;
  }

  const removed = customers.splice(index, 1)[0];
  saveCustomers(customers);
  pendingCustomerId = null;
  closeModal("deleteModal");
  renderCustomers(customers, getBookings());
  showToast(`${removed.name || removed.username} was deleted.`);
}

/**
 * Loads bookings and customers, then draws the admin home.
 *
 * @returns {Promise<void>}
 */
async function startAdminDashboard() {
  if (!session) {
    return;
  }

  mountAdminNav("home");
  document.querySelector("#welcomeName").textContent = session.name || session.username;

  try {
    await prepareStorage();
  } catch (error) {
    const alert = document.querySelector("#pageAlert");
    alert.hidden = false;
    alert.textContent = "Customer and booking data could not be loaded. Open this site with Live Server.";
    return;
  }

  const bookings = getBookings();
  renderClassTotals(bookings);
  renderQuarterlySales(bookings);
  renderCustomers(getCustomers(), bookings);

  document.querySelector("#customerRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-customer]");
    if (button) {
      askToDelete(button.dataset.deleteCustomer);
    }
  });

  document.querySelector("#deleteModal").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) {
      pendingCustomerId = null;
    }
  });

  document.querySelector("#confirmDelete").addEventListener("click", confirmDelete);
}

startAdminDashboard();
