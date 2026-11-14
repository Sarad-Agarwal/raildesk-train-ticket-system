/**
 * Customer home, US_UI_002.
 *
 * The page shows this customer's tickets per class and sales per quarter,
 * then the Book Ticket form. Submitting the form creates a booking and opens
 * the confirmation page. Train search, seats, and payment are a separate path
 * and are not used here.
 */

import { requireCustomer } from "./auth.js";
import { mountCustomerNav } from "./customer-nav.js";
import {
  clearFieldError,
  formatClock,
  formatInr,
  setFieldError
} from "./common.js";
import { getBookings, getCustomers, getStations, getTrains, prepareStorage, saveBookings } from "./storage.js";
import {
  todayIso,
  validateAge,
  validateJourneyDate,
  validateMobile,
  validateRequired,
  validateTicketCount
} from "./validation.js";

/** Categories named in the customer home booking form. */
const CATEGORIES = ["First Class", "AC Tier 1", "AC Tier 2", "Tatkal"];

const session = requireCustomer();

/**
 * Adds a number of days to a yyyy-mm-dd date.
 * Used when a train reaches the destination on a later day.
 *
 * @param {string} isoDate - Journey date.
 * @param {number} days - Day offset from the train stop list.
 * @returns {string} The resulting yyyy-mm-dd date.
 */
function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Returns the calendar quarter, from 1 to 4, for a journey date.
 *
 * @param {string} isoDate - yyyy-mm-dd date.
 * @returns {number} Quarter number.
 */
function quarterOf(isoDate) {
  const month = Number(isoDate.slice(5, 7));
  return Math.floor((month - 1) / 3) + 1;
}

/**
 * Finds the boarding and destination stops when the train passes them in order.
 *
 * @param {object} train - Train record from storage.
 * @param {string} boarding - Boarding station name.
 * @param {string} destination - Destination station name.
 * @returns {{boarding: object, destination: object} | null} The two stops, or null when the train cannot be used.
 */
function findSegment(train, boarding, destination) {
  const fromIndex = train.stops.findIndex((stop) => stop.name === boarding);
  const toIndex = train.stops.findIndex((stop) => stop.name === destination);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) {
    return null;
  }

  const fromStop = train.stops[fromIndex];
  const toStop = train.stops[toIndex];
  if (!fromStop.departure || !toStop.arrival) {
    return null;
  }

  return { boarding: fromStop, destination: toStop };
}

/**
 * Lists trains that run on the chosen date and serve the chosen stations in order.
 *
 * @param {string} boarding - Boarding station.
 * @param {string} destination - Destination station.
 * @param {string} journeyDate - yyyy-mm-dd date.
 * @returns {Array<object>} Matching trains, each with its segment attached.
 */
function trainsForJourney(boarding, destination, journeyDate) {
  if (!boarding || !destination || !journeyDate || boarding === destination) {
    return [];
  }

  const weekday = new Date(`${journeyDate}T00:00:00`).getDay();
  return getTrains().flatMap((train) => {
    if (!train.runsOn.includes(weekday)) {
      return [];
    }
    const segment = findSegment(train, boarding, destination);
    if (!segment) {
      return [];
    }
    return [{ ...train, segment }];
  });
}

/**
 * Draws the class totals for the signed-in customer.
 * The count is the number of tickets, not the number of booking records.
 *
 * @param {Array} bookings - This customer's bookings.
 * @returns {void}
 */
function renderClassTotals(bookings) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  bookings.forEach((booking) => {
    if (counts[booking.category] !== undefined && booking.status !== "Cancelled") {
      counts[booking.category] += Number(booking.ticketCount) || 0;
    }
  });

  const grid = document.querySelector("#classStats");
  const chart = document.querySelector("#classChart");
  grid.replaceChildren();
  chart.replaceChildren();

  const largest = Math.max(...Object.values(counts), 1);
  CATEGORIES.forEach((category) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    const label = document.createElement("p");
    label.className = "stat-card__label";
    label.textContent = category;
    const value = document.createElement("p");
    value.className = "stat-card__value";
    value.textContent = String(counts[category]);
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
    fill.style.width = `${(counts[category] / largest) * 100}%`;
    track.append(fill);
    const total = document.createElement("span");
    total.className = "bar-chart__value";
    total.textContent = String(counts[category]);
    row.append(name, track, total);
    chart.append(row);
  });
}

/**
 * Draws quarterly sales for the signed-in customer.
 * Sales are the stored fares of bookings whose journey is in the current year.
 *
 * @param {Array} bookings - This customer's bookings.
 * @returns {void}
 */
function renderQuarterlySales(bookings) {
  const year = new Date().getFullYear();
  const totals = [0, 0, 0, 0];

  bookings.forEach((booking) => {
    if (booking.status === "Cancelled" || !booking.journeyDate.startsWith(String(year))) {
      return;
    }
    totals[quarterOf(booking.journeyDate) - 1] += Number(booking.fare) || 0;
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
    bar.style.height = `${(amount / largest) * 100}%`;
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
 * Fills the station lists used by the booking form.
 *
 * @returns {void}
 */
function fillStations() {
  const stations = getStations().slice().sort((left, right) => left.localeCompare(right));
  ["#boardingStation", "#destinationStation"].forEach((selector) => {
    const select = document.querySelector(selector);
    stations.forEach((station) => {
      const option = document.createElement("option");
      option.value = station;
      option.textContent = station;
      select.append(option);
    });
  });
}

/**
 * Refreshes the train list for the selected route and date.
 * The list stays disabled until boarding, destination, and date are all present.
 *
 * @returns {void}
 */
function refreshTrains() {
  const boarding = document.querySelector("#boardingStation").value;
  const destination = document.querySelector("#destinationStation").value;
  const journeyDate = document.querySelector("#journeyDate").value;
  const trainSelect = document.querySelector("#trainId");
  const hint = document.querySelector("#trainHint");

  trainSelect.replaceChildren();
  const waiting = document.createElement("option");
  waiting.value = "";
  waiting.textContent = "Select a train";
  trainSelect.append(waiting);

  const matches = trainsForJourney(boarding, destination, journeyDate);
  matches.forEach((train) => {
    const option = document.createElement("option");
    option.value = train.id;
    option.textContent = `${train.number} · ${train.name} · ${formatClock(train.segment.boarding.departure)}`;
    trainSelect.append(option);
  });

  trainSelect.disabled = matches.length === 0;
  if (!boarding || !destination || !journeyDate) {
    hint.textContent = "Choose the boarding station, destination, and date to see trains.";
  } else if (boarding === destination) {
    hint.textContent = "Boarding and destination must be different stations.";
  } else if (!matches.length) {
    hint.textContent = "No train is available for this route and date.";
  } else {
    hint.textContent = `${matches.length} train${matches.length === 1 ? "" : "s"} available.`;
  }
}

/**
 * Creates the next booking id from the ids already stored.
 *
 * @param {Array} bookings - Existing bookings.
 * @returns {string} An id such as RD-24061.
 */
function nextBookingId(bookings) {
  const highest = bookings.reduce((current, booking) => {
    const number = Number(String(booking.id).replace("RD-", ""));
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 24000);
  return `RD-${highest + 1}`;
}

/**
 * Validates the Book Ticket form and returns the first invalid control.
 *
 * @returns {HTMLElement | null} The first invalid field, or null when the form can be saved.
 */
function validateBookingForm() {
  const fields = {
    passengerName: [document.querySelector("#passengerName"), validateRequired(document.querySelector("#passengerName").value, "Name")],
    mobile: [document.querySelector("#mobile"), validateMobile(document.querySelector("#mobile").value)],
    age: [document.querySelector("#age"), validateAge(document.querySelector("#age").value)],
    journeyDate: [document.querySelector("#journeyDate"), validateJourneyDate(document.querySelector("#journeyDate").value)],
    boardingStation: [document.querySelector("#boardingStation"), validateRequired(document.querySelector("#boardingStation").value, "Boarding station")],
    destinationStation: [document.querySelector("#destinationStation"), validateRequired(document.querySelector("#destinationStation").value, "Destination station")],
    category: [document.querySelector("#category"), validateRequired(document.querySelector("#category").value, "Ticket category")],
    trainId: [document.querySelector("#trainId"), validateRequired(document.querySelector("#trainId").value, "Train")],
    ticketCount: [document.querySelector("#ticketCount"), validateTicketCount(document.querySelector("#ticketCount").value)]
  };

  if (
    fields.boardingStation[0].value
    && fields.destinationStation[0].value
    && fields.boardingStation[0].value === fields.destinationStation[0].value
  ) {
    fields.destinationStation[1] = "Destination must be different from the boarding station.";
  }

  let firstInvalid = null;
  Object.values(fields).forEach(([input, message]) => {
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
 * Saves one booking from the home form and opens its confirmation page.
 *
 * @param {SubmitEvent} event - Form submission.
 * @returns {void}
 */
function submitBooking(event) {
  event.preventDefault();
  const firstInvalid = validateBookingForm();
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const boarding = document.querySelector("#boardingStation").value;
  const destination = document.querySelector("#destinationStation").value;
  const journeyDate = document.querySelector("#journeyDate").value;
  const trainId = document.querySelector("#trainId").value;
  const category = document.querySelector("#category").value;
  const ticketCount = Number(document.querySelector("#ticketCount").value);
  const match = trainsForJourney(boarding, destination, journeyDate).find((train) => train.id === trainId);

  if (!match || !match.fares[category]) {
    setFieldError(document.querySelector("#trainId"), "Select an available train.");
    return;
  }

  const bookings = getBookings();
  const booking = {
    id: nextBookingId(bookings),
    trainId: match.id,
    trainNumber: match.number,
    trainName: match.name,
    userId: session.userId,
    userName: session.name,
    passengerName: document.querySelector("#passengerName").value.trim(),
    mobile: document.querySelector("#mobile").value.trim(),
    age: Number(document.querySelector("#age").value),
    journeyDate,
    boardingStation: boarding,
    destinationStation: destination,
    boardingTime: match.segment.boarding.departure,
    arrivalTime: match.segment.destination.arrival,
    arrivalDate: addDays(journeyDate, match.segment.destination.day - match.segment.boarding.day),
    category,
    ticketCount,
    fare: match.fares[category] * ticketCount,
    status: "Confirmed"
  };

  bookings.push(booking);
  saveBookings(bookings);
  window.location.href = `booking-confirmation.html?booking=${encodeURIComponent(booking.id)}`;
}

/**
 * Loads the signed-in customer's figures and prepares the booking form.
 *
 * @returns {Promise<void>}
 */
async function startDashboard() {
  if (!session) {
    return;
  }

  mountCustomerNav("home");
  document.querySelector("#welcomeName").textContent = session.name;
  document.querySelector("#customerId").value = session.userId;
  document.querySelector("#passengerName").value = session.name;

  try {
    await prepareStorage();
  } catch (error) {
    document.querySelector("#pageAlert").hidden = false;
    document.querySelector("#pageAlert").textContent = "Train and booking data could not be loaded. Open this site with Live Server.";
    return;
  }

  const mine = getBookings().filter((booking) => booking.userId === session.userId);
  const account = getCustomers().find((customer) => customer.id === session.userId);
  if (account) {
    document.querySelector("#mobile").value = account.mobile;
    document.querySelector("#passengerName").value = account.name || session.name;
  }

  renderClassTotals(mine);
  renderQuarterlySales(mine);
  fillStations();
  document.querySelector("#journeyDate").min = todayIso();
  ["#boardingStation", "#destinationStation", "#journeyDate"].forEach((selector) => {
    document.querySelector(selector).addEventListener("change", refreshTrains);
  });
  refreshTrains();
  document.querySelector("#bookForm").addEventListener("submit", submitBooking);
}

startDashboard();
