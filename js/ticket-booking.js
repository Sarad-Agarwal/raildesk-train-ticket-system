/**
 * Ticket booking for the train chosen in Train Search.
 *
 * The page keeps the saved train and class, then collects passengers,
 * seat numbers, and a demonstration card payment. A confirmed booking is
 * written with the same record shape as the customer-home Book Ticket form,
 * plus the selected seat numbers. Cancelled bookings do not occupy seats.
 *
 * The customer-home form does not use this page.
 */

import { requireCustomer } from "./auth.js";
import { getBookings, getTrains, prepareStorage, saveBookings } from "./storage.js";
import {
  clearFieldError,
  formatClock,
  formatDisplayDate,
  formatInr,
  setButtonLoading,
  setFieldError,
  showToast
} from "./common.js";
import { mountCustomerNav } from "./customer-nav.js";
import { validateAge, validateMobile, validateRequired, validateTicketCount } from "./validation.js";

const DRAFT_KEY = "raildesk_booking_draft";
const RECEIPT_KEY = "raildesk_booking_receipt";

/**
 * Same class shares as Train Search, so the seat map matches the
 * availability shown on the train card.
 */
const CLASS_WEIGHT = {
  "First Class": 1,
  "AC Tier 1": 2,
  "AC Tier 2": 4,
  "AC Tier 3": 6,
  "Sleeper": 8,
  "Chair Car": 5,
  "Tatkal": 1
};

const MAX_TICKETS = 6;

const session = requireCustomer();

/** @type {object | null} Train and class saved by Train Search. */
let draft = null;

/** @type {Array<{name: string, age: string, gender: string}>} */
let passengers = [];

/** @type {number} Seats still free for this train, date, and class. */
let seatsLeft = 0;

/**
 * Reads the train and class saved by Book now.
 *
 * @returns {object | null}
 */
function readDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    if (!saved || !saved.trainId || !saved.selectedClass || !saved.journeyDate) {
      return null;
    }
    return saved;
  } catch (error) {
    return null;
  }
}

/**
 * Capacity for one class, using the same share of train.seats as Train Search.
 *
 * @param {object | null} train - Stored train, when it still exists.
 * @param {string} className - Selected fare class.
 * @returns {number}
 */
function classCapacity(train, className) {
  if (!train) {
    return Math.max(1, Number(draft.capacity) || 1);
  }
  const names = Object.keys(train.fares || {});
  const totalWeight = names.reduce((sum, name) => sum + (CLASS_WEIGHT[name] || 1), 0);
  const weight = CLASS_WEIGHT[className] || 1;
  return Math.max(1, Math.round((Number(train.seats) || 0) * weight / totalWeight));
}

/**
 * Seat numbers already held for this train, date, and class.
 * A booking that stores seat numbers keeps those seats. Older bookings
 * that only store a ticket count take the lowest free numbers.
 * Cancelled bookings are ignored, so those seats can be booked again.
 *
 * @param {number} capacity - Seats in this class.
 * @returns {Set<string>}
 */
function occupiedSeatNumbers(capacity) {
  const taken = new Set();
  const legacyCounts = [];

  getBookings().forEach((booking) => {
    if (booking.trainId !== draft.trainId || booking.journeyDate !== draft.journeyDate) {
      return;
    }
    if (booking.category !== draft.selectedClass || booking.status === "Cancelled") {
      return;
    }
    if (Array.isArray(booking.seats) && booking.seats.length) {
      booking.seats.forEach((seat) => taken.add(String(seat)));
      return;
    }
    legacyCounts.push(Number(booking.ticketCount) || 0);
  });

  legacyCounts.forEach((count) => {
    let placed = 0;
    let number = 1;
    while (placed < count && number <= capacity) {
      const label = String(number);
      if (!taken.has(label)) {
        taken.add(label);
        placed += 1;
      }
      number += 1;
    }
  });

  return taken;
}

/**
 * Seats still available, matching the count Train Search would show.
 *
 * @returns {{capacity: number, taken: Set<string>, remaining: number}}
 */
function availability() {
  const train = getTrains().find((item) => item.id === draft.trainId) || null;
  const capacity = classCapacity(train, draft.selectedClass);
  const taken = occupiedSeatNumbers(capacity);
  const remaining = Math.max(0, capacity - taken.size);
  return { capacity, taken, remaining };
}

/**
 * Next booking id, continuing the RD- numbers already in storage.
 *
 * @param {Array} bookings - Every stored booking.
 * @returns {string}
 */
function nextBookingId(bookings) {
  const highest = bookings.reduce((current, booking) => {
    const number = Number(String(booking.id).replace("RD-", ""));
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 24000);
  return `RD-${highest + 1}`;
}

/**
 * Adds one label and value to a description list.
 *
 * @param {HTMLElement} list - The description list.
 * @param {string} label - Visible label.
 * @param {string} value - Visible value.
 * @param {boolean} [mono] - Use the mono face for ids and times.
 * @returns {void}
 */
function addDetail(list, label, value, mono = false) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  if (mono) {
    description.className = "mono";
  }
  row.append(term, description);
  list.append(row);
}

/**
 * Shows the empty state when Book now was not used.
 *
 * @returns {void}
 */
function showMissing() {
  document.querySelector("#missing").hidden = false;
  document.querySelector("#booking").hidden = true;
  document.querySelector("#confirmation").hidden = true;
}

/**
 * Fills the train summary from the saved search choice.
 *
 * @returns {void}
 */
function fillTrainSummary() {
  document.querySelector("#trainTitle").textContent = `${draft.trainNumber} ${draft.trainName}`;
  const list = document.querySelector("#details");
  list.replaceChildren();
  addDetail(list, "Train ID", draft.trainId, true);
  addDetail(list, "From", draft.origin);
  addDetail(list, "To", draft.destination);
  addDetail(list, "Journey date", formatDisplayDate(draft.journeyDate));
  addDetail(list, "Departure", formatClock(draft.departureTime), true);
  addDetail(list, "Arrival", `${formatDisplayDate(draft.arrivalDate)} · ${formatClock(draft.arrivalTime)}`, true);
  addDetail(list, "Class", draft.selectedClass);
  addDetail(list, "Fare per ticket", formatInr(draft.fare), true);
  addDetail(list, "Seats left", String(seatsLeft), true);
}

/**
 * How many tickets this booking may include.
 *
 * @returns {number}
 */
function ticketLimit() {
  return Math.max(0, Math.min(MAX_TICKETS, seatsLeft));
}

/**
 * Writes the fare line for the current ticket count.
 *
 * @returns {void}
 */
function updateFarePreview() {
  const count = Number(document.querySelector("#ticketCount").value);
  const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
  const total = Number(draft.fare) * safeCount;
  const text = safeCount
    ? `${formatInr(total)} for ${safeCount} ticket${safeCount === 1 ? "" : "s"}`
    : "Enter the number of tickets to see the fare.";
  document.querySelector("#farePreview").textContent = text;
  document.querySelector("#paymentTotal").textContent = text;
}

/**
 * Builds one passenger block. Values already typed are kept when the count changes.
 *
 * @param {number} index - Zero-based passenger index.
 * @param {{name?: string, age?: string, gender?: string}} previous - Earlier answers.
 * @returns {HTMLElement}
 */
function createPassengerBlock(index, previous) {
  const block = document.createElement("section");
  block.className = "passenger-block";
  block.dataset.passenger = String(index);

  const title = document.createElement("h3");
  title.textContent = `Passenger ${index + 1}`;

  const grid = document.createElement("div");
  grid.className = "grid-3";

  grid.append(
    field("Name", `passenger-name-${index}`, "text", previous.name || "", "data-name"),
    field("Age", `passenger-age-${index}`, "text", previous.age || "", "data-age"),
    genderField(index, previous.gender || "")
  );

  block.append(title, grid);
  return block;
}

/**
 * One labelled text field inside a passenger block.
 *
 * @param {string} label - Visible label.
 * @param {string} id - Input id.
 * @param {string} type - Input type.
 * @param {string} value - Current value.
 * @param {string} dataName - Attribute the reader uses.
 * @returns {HTMLElement}
 */
function field(label, id, type, value, dataName) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const labelEl = document.createElement("label");
  labelEl.className = "field__label";
  labelEl.htmlFor = id;
  labelEl.textContent = label;
  const input = document.createElement("input");
  input.className = "field__input";
  input.id = id;
  input.type = type;
  input.value = value;
  input.setAttribute(dataName, "");
  if (dataName === "data-age") {
    input.inputMode = "numeric";
  }
  const error = document.createElement("p");
  error.className = "field__error";
  error.hidden = true;
  wrap.append(labelEl, input, error);
  return wrap;
}

/**
 * Gender choices for one passenger.
 *
 * @param {number} index - Zero-based passenger index.
 * @param {string} value - Current choice.
 * @returns {HTMLElement}
 */
function genderField(index, value) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.className = "field__label";
  label.htmlFor = `passenger-gender-${index}`;
  label.textContent = "Gender";
  const select = document.createElement("select");
  select.className = "field__input";
  select.id = `passenger-gender-${index}`;
  select.dataset.gender = "";
  ["", "Female", "Male", "Other"].forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue || "Select";
    option.selected = optionValue === value;
    select.append(option);
  });
  const error = document.createElement("p");
  error.className = "field__error";
  error.hidden = true;
  wrap.append(label, select, error);
  return wrap;
}

/**
 * Rebuilds the passenger forms for the typed ticket count.
 *
 * @returns {void}
 */
function buildPassengerFields() {
  const typed = Number(document.querySelector("#ticketCount").value);
  const count = Number.isInteger(typed) && typed > 0 ? Math.min(typed, MAX_TICKETS) : 1;
  const previous = readPassengerInputs();
  const list = document.querySelector("#passengerList");
  list.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    list.append(createPassengerBlock(index, previous[index] || {}));
  }
}

/**
 * Reads the passenger inputs without validating them.
 *
 * @returns {Array<{name: string, age: string, gender: string}>}
 */
function readPassengerInputs() {
  return [...document.querySelectorAll("[data-passenger]")].map((block) => ({
    name: block.querySelector("[data-name]").value.trim(),
    age: block.querySelector("[data-age]").value.trim(),
    gender: block.querySelector("[data-gender]").value
  }));
}

/**
 * Checks the ticket count, mobile number, and every passenger.
 *
 * @returns {boolean} True when the passenger step can continue.
 */
function validatePassengers() {
  let valid = true;
  const countInput = document.querySelector("#ticketCount");
  const countError = validateTicketCount(countInput.value);
  const count = Number(countInput.value);
  clearFieldError(countInput);
  if (countError) {
    setFieldError(countInput, countError);
    valid = false;
  } else if (count > ticketLimit()) {
    const left = ticketLimit();
    setFieldError(countInput, left
      ? `Only ${left} ticket${left === 1 ? "" : "s"} can be booked in this class.`
      : "This class has no seats left.");
    valid = false;
  }

  const mobile = document.querySelector("#mobile");
  const mobileError = validateMobile(mobile.value);
  clearFieldError(mobile);
  if (mobileError) {
    setFieldError(mobile, mobileError);
    valid = false;
  }

  document.querySelectorAll("[data-passenger]").forEach((block) => {
    const name = block.querySelector("[data-name]");
    const age = block.querySelector("[data-age]");
    const gender = block.querySelector("[data-gender]");
    const nameError = validateRequired(name.value, "Passenger name");
    const ageError = validateAge(age.value);
    clearFieldError(name);
    clearFieldError(age);
    clearFieldError(gender);
    if (nameError) {
      setFieldError(name, nameError);
      valid = false;
    }
    if (ageError) {
      setFieldError(age, ageError);
      valid = false;
    }
    if (!gender.value) {
      setFieldError(gender, "Select a gender.");
      valid = false;
    }
  });

  return valid;
}

/**
 * Moves the stepper and shows one step panel.
 *
 * @param {"passengers" | "seats" | "payment"} step - The step to show.
 * @returns {void}
 */
function showStep(step) {
  document.querySelector("#passengerPanel").hidden = step !== "passengers";
  document.querySelector("#seatPanel").hidden = step !== "seats";
  document.querySelector("#paymentPanel").hidden = step !== "payment";
  document.querySelector("#confirmation").hidden = true;
  document.querySelector("#booking").hidden = false;

  const order = ["passengers", "seats", "payment"];
  const currentIndex = order.indexOf(step);
  ["stepPassengers", "stepSeats", "stepPayment"].forEach((id, index) => {
    const item = document.querySelector(`#${id}`);
    item.classList.toggle("is-current", index === currentIndex);
    item.classList.toggle("is-complete", index < currentIndex);
  });
}

/**
 * Draws the seat map for the selected class.
 * Occupied seats cannot be chosen. The customer must select one seat per ticket.
 *
 * @returns {void}
 */
function renderSeatMap() {
  const { capacity, taken, remaining } = availability();
  seatsLeft = remaining;
  const needed = passengers.length;
  const coach = document.querySelector("#coach");
  coach.replaceChildren();
  document.querySelector("#seatError").hidden = true;

  for (let start = 1; start <= capacity; start += 6) {
    const bay = document.createElement("div");
    bay.className = "coach__bay";
    for (let number = start; number < start + 6 && number <= capacity; number += 1) {
      const label = String(number);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "seat";
      button.dataset.seat = label;
      button.textContent = label;
      if (taken.has(label)) {
        button.classList.add("seat--occupied");
        button.disabled = true;
        button.setAttribute("aria-label", `Seat ${label}, occupied`);
      } else {
        button.classList.add("seat--available");
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", `Seat ${label}, available`);
      }
      bay.append(button);
    }
    coach.append(bay);
  }

  document.querySelector("#seatIntro").textContent =
    `Select ${needed} seat${needed === 1 ? "" : "s"} in ${draft.selectedClass}. ${remaining} seat${remaining === 1 ? " is" : "s are"} left.`;
  updateSeatCount();
}

/**
 * Counts the seats currently selected.
 *
 * @returns {string[]}
 */
function selectedSeats() {
  return [...document.querySelectorAll("#coach .seat--selected")].map((seat) => seat.dataset.seat);
}

/**
 * Updates the "N of M seats selected" line.
 *
 * @returns {void}
 */
function updateSeatCount() {
  const selected = selectedSeats().length;
  const needed = passengers.length;
  document.querySelector("#seatCount").textContent =
    `${selected} of ${needed} seat${needed === 1 ? "" : "s"} selected`;
}

/**
 * Selects or clears a seat, and stops the customer selecting more than the ticket count.
 *
 * @param {HTMLButtonElement} seat - The seat button.
 * @returns {void}
 */
function toggleSeat(seat) {
  if (seat.disabled || seat.classList.contains("seat--occupied")) {
    return;
  }
  const willSelect = !seat.classList.contains("seat--selected");
  if (willSelect && selectedSeats().length >= passengers.length) {
    showToast(`Select ${passengers.length} seat${passengers.length === 1 ? "" : "s"} for this booking.`, "error");
    return;
  }
  seat.classList.toggle("seat--selected", willSelect);
  seat.classList.toggle("seat--available", !willSelect);
  seat.setAttribute("aria-pressed", String(willSelect));
  seat.setAttribute("aria-label", `Seat ${seat.dataset.seat}, ${willSelect ? "selected" : "available"}`);
  document.querySelector("#seatError").hidden = true;
  updateSeatCount();
}

/**
 * Checks that the selected seats still match the ticket count and are free.
 *
 * @returns {boolean}
 */
function validateSeats() {
  const needed = passengers.length;
  const chosen = selectedSeats();
  const error = document.querySelector("#seatError");
  if (chosen.length !== needed) {
    error.hidden = false;
    error.textContent = needed === 1
      ? "Select 1 seat before continuing."
      : `Select ${needed} seats before continuing.`;
    return false;
  }
  const { taken } = availability();
  if (chosen.some((seat) => taken.has(seat))) {
    error.hidden = false;
    error.textContent = "One of those seats was just booked. Choose another seat.";
    renderSeatMap();
    return false;
  }
  error.hidden = true;
  return true;
}

/**
 * Fills the expiry month and year lists once.
 *
 * @returns {void}
 */
function fillExpiryOptions() {
  const month = document.querySelector("#expiryMonth");
  const year = document.querySelector("#expiryYear");
  if (month.options.length > 1) {
    return;
  }
  for (let value = 1; value <= 12; value += 1) {
    const option = document.createElement("option");
    option.value = String(value).padStart(2, "0");
    option.textContent = option.value;
    month.append(option);
  }
  const thisYear = new Date().getFullYear();
  for (let value = thisYear; value <= thisYear + 12; value += 1) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = option.value;
    year.append(option);
  }
}

/**
 * Checks the demonstration card. Nothing is sent to a payment service.
 *
 * @returns {{valid: boolean, last4: string}}
 */
function validatePayment() {
  const name = document.querySelector("#cardName");
  const number = document.querySelector("#cardNumber");
  const month = document.querySelector("#expiryMonth");
  const year = document.querySelector("#expiryYear");
  const cvv = document.querySelector("#cvv");
  let valid = true;

  const nameError = validateRequired(name.value, "Name on card");
  clearFieldError(name);
  if (nameError) {
    setFieldError(name, nameError);
    valid = false;
  }

  const digits = number.value.replace(/[\s-]/g, "");
  clearFieldError(number);
  if (!/^[0-9]{16}$/.test(digits)) {
    setFieldError(number, "Enter a 16-digit card number.");
    valid = false;
  }

  clearFieldError(month);
  clearFieldError(year);
  if (!month.value || !year.value) {
    if (!month.value) {
      setFieldError(month, "Select the expiry month.");
    }
    if (!year.value) {
      setFieldError(year, "Select the expiry year.");
    }
    valid = false;
  } else {
    const lastDay = new Date(Number(year.value), Number(month.value), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (lastDay < today) {
      setFieldError(year, "This card has expired.");
      valid = false;
    }
  }

  clearFieldError(cvv);
  if (!/^[0-9]{3}$/.test(cvv.value.trim())) {
    setFieldError(cvv, "Enter the 3-digit CVV.");
    valid = false;
  }

  return { valid, last4: digits.slice(-4) };
}

/**
 * Saves a confirmed booking for the signed-in customer.
 * The card number is not stored.
 *
 * @param {string[]} seats - Selected seat numbers.
 * @returns {object | null} The saved booking, or null when the seats are gone.
 */
function createBooking(seats) {
  const current = availability();
  if (seats.some((seat) => current.taken.has(seat)) || seats.length > current.remaining) {
    return null;
  }

  const bookings = getBookings();
  const ticketCount = passengers.length;
  const booking = {
    id: nextBookingId(bookings),
    trainId: draft.trainId,
    trainNumber: draft.trainNumber,
    trainName: draft.trainName,
    userId: session.userId,
    userName: session.name || session.username,
    passengerName: passengers.map((person) => person.name).join(", "),
    passengers: passengers.map((person, index) => ({
      name: person.name,
      age: Number(person.age),
      gender: person.gender,
      seat: seats[index]
    })),
    mobile: document.querySelector("#mobile").value.trim(),
    age: Number(passengers[0].age),
    journeyDate: draft.journeyDate,
    boardingStation: draft.origin,
    destinationStation: draft.destination,
    boardingTime: draft.departureTime,
    arrivalTime: draft.arrivalTime,
    arrivalDate: draft.arrivalDate,
    category: draft.selectedClass,
    ticketCount,
    fare: Number(draft.fare) * ticketCount,
    seats,
    status: "Confirmed"
  };

  bookings.push(booking);
  saveBookings(bookings);
  return booking;
}

/**
 * Replaces the form with the saved ticket.
 *
 * @param {object} booking - The booking just saved.
 * @param {string} last4 - Last four digits of the demonstration card.
 * @returns {void}
 */
function showConfirmation(booking, last4) {
  document.querySelector("#booking").hidden = true;
  document.querySelector("#missing").hidden = true;
  const panel = document.querySelector("#confirmation");
  panel.hidden = false;
  document.querySelector("#bookingId").textContent = booking.id;

  const people = Array.isArray(booking.passengers) && booking.passengers.length
    ? booking.passengers.map((person) => `${person.name}, ${person.age}, ${person.gender}, seat ${person.seat}`).join("; ")
    : `${booking.passengerName}, age ${booking.age}`;
  const seatList = Array.isArray(booking.seats) && booking.seats.length
    ? booking.seats.join(", ")
    : "Not recorded";

  const list = document.querySelector("#confirmationDetails");
  list.replaceChildren();
  addDetail(list, "Booking ID", booking.id, true);
  addDetail(list, "Status", booking.status);
  addDetail(list, "Train", `${booking.trainNumber} ${booking.trainName}`);
  addDetail(list, "Train ID", booking.trainId, true);
  addDetail(list, "Passenger", people);
  addDetail(list, "Mobile", booking.mobile, true);
  addDetail(list, "From", booking.boardingStation);
  addDetail(list, "To", booking.destinationStation);
  addDetail(list, "Journey date", formatDisplayDate(booking.journeyDate));
  addDetail(list, "Departure", formatClock(booking.boardingTime), true);
  addDetail(list, "Arrival", `${formatDisplayDate(booking.arrivalDate)} · ${formatClock(booking.arrivalTime)}`, true);
  addDetail(list, "Class", booking.category);
  addDetail(list, "Tickets", String(booking.ticketCount), true);
  addDetail(list, "Seats", seatList, true);
  addDetail(list, "Fare", formatInr(booking.fare), true);
  addDetail(list, "Payment", last4 ? `Demonstration card ending ${last4}` : "Demonstration payment");
  panel.scrollIntoView({ block: "start" });
}

/**
 * Shows a booking that was just confirmed, including after a refresh.
 *
 * @returns {boolean} True when a receipt was shown.
 */
function showStoredReceipt() {
  const receiptId = sessionStorage.getItem(RECEIPT_KEY);
  if (!receiptId) {
    return false;
  }
  const booking = getBookings().find((item) => item.id === receiptId && item.userId === session.userId);
  if (!booking) {
    sessionStorage.removeItem(RECEIPT_KEY);
    return false;
  }
  const last4 = sessionStorage.getItem("raildesk_booking_card_hint") || "";
  showConfirmation(booking, last4);
  return true;
}

/**
 * Wires the three booking steps.
 *
 * @returns {void}
 */
function bindBooking() {
  document.querySelector("#ticketCount").addEventListener("input", () => {
    buildPassengerFields();
    updateFarePreview();
  });

  document.querySelector("#passengerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validatePassengers()) {
      showToast("Check the passenger details.", "error");
      return;
    }
    passengers = readPassengerInputs();
    renderSeatMap();
    showStep("seats");
  });

  document.querySelector("#coach").addEventListener("click", (event) => {
    const seat = event.target.closest("button.seat");
    if (seat) {
      toggleSeat(seat);
    }
  });

  document.querySelector("#backToPassengers").addEventListener("click", () => {
    showStep("passengers");
  });

  document.querySelector("#toPayment").addEventListener("click", () => {
    if (!validateSeats()) {
      return;
    }
    updateFarePreview();
    showStep("payment");
    document.querySelector("#cardName").focus();
  });

  document.querySelector("#backToSeats").addEventListener("click", () => {
    showStep("seats");
  });

  document.querySelector("#paymentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const payment = validatePayment();
    if (!payment.valid) {
      showToast("Check the payment details.", "error");
      return;
    }
    if (!validateSeats()) {
      showStep("seats");
      showToast("Choose the seats again. One of them is no longer free.", "error");
      return;
    }

    const button = document.querySelector("#payButton");
    setButtonLoading(button, true);
    const booking = createBooking(selectedSeats());
    setButtonLoading(button, false);

    if (!booking) {
      showStep("seats");
      renderSeatMap();
      showToast("Those seats are no longer free. Choose again.", "error");
      return;
    }

    sessionStorage.setItem(RECEIPT_KEY, booking.id);
    sessionStorage.setItem("raildesk_booking_card_hint", payment.last4);
    sessionStorage.removeItem(DRAFT_KEY);
    showConfirmation(booking, payment.last4);
    showToast(`${booking.id} is confirmed.`);
  });
}

/**
 * Opens the booking for the signed-in customer.
 *
 * @returns {Promise<void>}
 */
async function startTicketBooking() {
  if (!session) {
    return;
  }
  mountCustomerNav("search");
  await prepareStorage();

  draft = readDraft();
  if (!draft) {
    if (!showStoredReceipt()) {
      showMissing();
    }
    return;
  }

  const current = availability();
  seatsLeft = current.remaining;
  if (seatsLeft < 1) {
    showMissing();
    document.querySelector("#missing .empty-state__title").textContent = "No seats left";
    document.querySelector("#missing .empty-state__text").textContent =
      "This class is full for the selected date. Return to the search results and choose another class.";
    return;
  }

  document.querySelector("#booking").hidden = false;
  fillTrainSummary();
  fillExpiryOptions();
  document.querySelector("#ticketHint").textContent =
    `Up to ${ticketLimit()} ticket${ticketLimit() === 1 ? "" : "s"} can be booked. ${seatsLeft} seat${seatsLeft === 1 ? " is" : "s are"} left in ${draft.selectedClass}.`;
  buildPassengerFields();
  updateFarePreview();
  bindBooking();
  showStep("passengers");
}

startTicketBooking();
