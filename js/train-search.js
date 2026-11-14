/**
 * Train Search and Seat Availability.
 *
 * A train matches when it stops at the origin before the destination and
 * runs on the weekday of the journey date. Seat counts come from the train's
 * seat total and from bookings on that train, date, and class. Cancelled
 * bookings do not take a seat.
 *
 * Book now stores the chosen train in sessionStorage and opens ticket booking.
 * The search itself is stored too, so Back to search results can repeat it.
 */

import { requireCustomer } from "./auth.js";
import {
  debounce,
  formatClock,
  formatDisplayDate,
  formatInr,
  setButtonLoading,
  setFieldError,
  clearFieldError,
  showToast
} from "./common.js";
import { mountCustomerNav } from "./customer-nav.js";
import { getBookings, getStations, getTrains, prepareStorage } from "./storage.js";
import { todayIso, validateJourneyDate } from "./validation.js";

const SEARCH_KEY = "raildesk_train_search";
const DRAFT_KEY = "raildesk_booking_draft";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Classes the demonstration timetable can sell.
 * A train only shows the classes present in its own fare table.
 * The weight is that class's share of train.seats. Tatkal is its own quota
 * in this timetable, matching the ticket category used on the customer home.
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

const CLASS_ORDER = Object.keys(CLASS_WEIGHT);

const session = requireCustomer();
let stations = [];
let searchResults = [];
let query = null;
let searchToken = 0;
const filters = { className: "", availability: "", sort: "departure" };
const expanded = new Set();
const chosenClass = new Map();

/**
 * Matches a typed station to the timetable name, ignoring letter case.
 *
 * @param {string} value - Text in the origin or destination field.
 * @returns {string} The station name from stations.json, or an empty string.
 */
function canonicalStation(value) {
  const typed = String(value || "").trim().toLowerCase();
  if (!typed) {
    return "";
  }
  return stations.find((name) => name.toLowerCase() === typed) || "";
}

/**
 * Finds the two stops when the train calls at them in that order.
 * The origin must have a departure and the destination must have an arrival.
 *
 * @param {object} train - Train record from storage.
 * @param {string} origin - Origin station.
 * @param {string} destination - Destination station.
 * @returns {{boarding: object, destination: object} | null}
 */
function findSegment(train, origin, destination) {
  const fromIndex = train.stops.findIndex((stop) => stop.name === origin);
  const toIndex = train.stops.findIndex((stop) => stop.name === destination);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) {
    return null;
  }

  const boarding = train.stops[fromIndex];
  const arrival = train.stops[toIndex];
  if (!boarding.departure || !arrival.arrival) {
    return null;
  }

  return { boarding, destination: arrival };
}

/**
 * Turns a HH:MM time into minutes after midnight.
 *
 * @param {string} time - 24-hour time.
 * @returns {number}
 */
function minutesOf(time) {
  const [hours, minutes] = String(time || "0:0").split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Minutes from the boarding departure to the destination arrival,
 * including nights when the stop day is later than the boarding day.
 *
 * @param {{boarding: object, destination: object}} segment - The two stops.
 * @returns {number}
 */
function segmentMinutes(segment) {
  const start = segment.boarding.day * 1440 + minutesOf(segment.boarding.departure);
  const end = segment.destination.day * 1440 + minutesOf(segment.destination.arrival);
  return end - start;
}

/**
 * Formats a duration such as 17h 10m.
 *
 * @param {number} minutes - Length of the journey.
 * @returns {string}
 */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${String(rest).padStart(2, "0")}m`;
}

/**
 * Adds days to a journey date. Used for the arrival date on the booking page.
 *
 * @param {string} isoDate - yyyy-mm-dd.
 * @param {number} days - Whole days to add.
 * @returns {string}
 */
function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Describes the days a train runs. A full week is "Daily".
 *
 * @param {Array<number>} runsOn - Weekday numbers, Sunday = 0.
 * @returns {string}
 */
function runningDaysLabel(runsOn) {
  const days = [...runsOn].sort((left, right) => left - right);
  if (days.length === 7) {
    return "Daily";
  }
  const missing = [0, 1, 2, 3, 4, 5, 6].filter((day) => !days.includes(day));
  if (missing.length === 1) {
    return `Daily except ${WEEKDAYS[missing[0]]}`;
  }
  return days.map((day) => WEEKDAY_SHORT[day]).join(", ");
}

/**
 * Capacity for one class is that class's share of the train's seat count.
 * The shares use CLASS_WEIGHT, so the numbers come from train.seats
 * rather than a fixed seat figure typed onto the card.
 *
 * @param {object} train - Train record.
 * @param {string} className - Fare class on this train.
 * @returns {number}
 */
function classCapacity(train, className) {
  const names = Object.keys(train.fares || {});
  const totalWeight = names.reduce((sum, name) => sum + (CLASS_WEIGHT[name] || 1), 0);
  const weight = CLASS_WEIGHT[className] || 1;
  return Math.max(1, Math.round((Number(train.seats) || 0) * weight / totalWeight));
}

/**
 * Counts tickets already held for one train, date, and class.
 * A cancelled booking stays in storage but does not consume a seat.
 *
 * @param {string} trainId - Train id such as TRN-12301.
 * @param {string} journeyDate - yyyy-mm-dd.
 * @param {string} className - Ticket category.
 * @returns {number}
 */
function occupiedSeats(trainId, journeyDate, className) {
  return getBookings().reduce((sum, booking) => {
    if (booking.trainId !== trainId || booking.journeyDate !== journeyDate) {
      return sum;
    }
    if (booking.category !== className || booking.status === "Cancelled") {
      return sum;
    }
    return sum + (Number(booking.ticketCount) || 0);
  }, 0);
}

/**
 * Turns remaining seats into Available, Limited Seats, or Waiting List.
 * Limited means about one fifth of that class is left, and never more than
 * a handful of seats. Waiting List means none remain.
 *
 * @param {number} remaining - Seats still open.
 * @param {number} capacity - Seats allocated to the class.
 * @returns {string}
 */
function availabilityStatus(remaining, capacity) {
  if (remaining <= 0) {
    return "Waiting List";
  }
  if (remaining <= Math.max(4, Math.round(capacity * 0.2))) {
    return "Limited Seats";
  }
  return "Available";
}

/**
 * Builds the class rows for one train on the searched date.
 *
 * @param {object} train - Train record.
 * @param {string} journeyDate - yyyy-mm-dd.
 * @returns {Array<object>}
 */
function classAvailability(train, journeyDate) {
  return CLASS_ORDER.filter((className) => train.fares && train.fares[className] !== undefined)
    .map((className) => {
      const capacity = classCapacity(train, className);
      const booked = occupiedSeats(train.id, journeyDate, className);
      const remaining = Math.max(0, capacity - booked);
      return {
        className,
        capacity,
        booked,
        remaining,
        fare: train.fares[className],
        status: availabilityStatus(remaining, capacity)
      };
    });
}

/**
 * Lists trains that serve the stations in order and run on that weekday.
 *
 * @param {string} origin - Origin station.
 * @param {string} destination - Destination station.
 * @param {string} journeyDate - yyyy-mm-dd.
 * @returns {Array<object>}
 */
function searchTrains(origin, destination, journeyDate) {
  const weekday = new Date(`${journeyDate}T00:00:00`).getDay();
  return getTrains().flatMap((train) => {
    if (!train.runsOn.includes(weekday)) {
      return [];
    }
    const segment = findSegment(train, origin, destination);
    if (!segment) {
      return [];
    }
    return [{
      ...train,
      segment,
      classes: classAvailability(train, journeyDate)
    }];
  });
}

/**
 * Explains an empty result. A train that serves the route but not that
 * weekday gets a running-day message. Any other miss is an unmatched route.
 *
 * @param {string} origin - Origin station.
 * @param {string} destination - Destination station.
 * @param {string} journeyDate - yyyy-mm-dd.
 * @returns {string}
 */
function emptyReason(origin, destination, journeyDate) {
  const weekday = new Date(`${journeyDate}T00:00:00`).getDay();
  const serving = getTrains().filter((train) => findSegment(train, origin, destination));
  const notRunning = serving.filter((train) => !train.runsOn.includes(weekday));
  if (serving.length && notRunning.length === serving.length) {
    const names = [...new Set(notRunning.map((train) => `${train.number} ${train.name}`))];
    const subject = names.join(" and ");
    if (names.length === 1) {
      return `${subject} serves this route, but it does not run on ${WEEKDAYS[weekday]}.`;
    }
    return `${subject} serve this route, but they do not run on ${WEEKDAYS[weekday]}.`;
  }
  return "No train in the timetable runs between these stations on the selected date.";
}

/**
 * Classes the active class filter still wants to consider.
 * Availability and fare sorting use this list.
 *
 * @param {object} train - Search result.
 * @returns {Array<object>}
 */
function relevantClasses(train) {
  if (!filters.className) {
    return train.classes;
  }
  return train.classes.filter((item) => item.className === filters.className);
}

/**
 * Applies the class filter, the availability filter, and the chosen sort.
 * Sorting by fare uses the selected class, or the lowest fare when all classes show.
 *
 * @param {Array<object>} trains - Unfiltered search results.
 * @returns {Array<object>}
 */
function applyFilters(trains) {
  const visible = trains.filter((train) => {
    const classes = relevantClasses(train);
    if (!classes.length) {
      return false;
    }
    if (filters.availability && !classes.some((item) => item.status === filters.availability)) {
      return false;
    }
    return true;
  });

  visible.sort((left, right) => {
    if (filters.sort === "fare") {
      const fareDiff = Math.min(...relevantClasses(left).map((item) => item.fare))
        - Math.min(...relevantClasses(right).map((item) => item.fare));
      if (fareDiff) {
        return fareDiff;
      }
    }
    if (filters.sort === "arrival") {
      const arrivalDiff = segmentMinutes(left.segment) + minutesOf(left.segment.boarding.departure)
        - (segmentMinutes(right.segment) + minutesOf(right.segment.boarding.departure));
      if (arrivalDiff) {
        return arrivalDiff;
      }
    }
    const departureDiff = minutesOf(left.segment.boarding.departure) - minutesOf(right.segment.boarding.departure);
    if (departureDiff) {
      return departureDiff;
    }
    return left.number.localeCompare(right.number);
  });

  return visible;
}

/**
 * Picks the status badge for the card heading.
 * With a class filter, that class decides the badge.
 *
 * @param {object} train - Search result.
 * @returns {string}
 */
function headlineStatus(train) {
  const classes = relevantClasses(train);
  if (classes.some((item) => item.status === "Available")) {
    return "Available";
  }
  if (classes.some((item) => item.status === "Limited Seats")) {
    return "Limited Seats";
  }
  return "Waiting List";
}

/**
 * Maps a status to the shared badge colour.
 *
 * @param {string} status - Available, Limited Seats, or Waiting List.
 * @returns {string}
 */
function badgeClass(status) {
  if (status === "Available") {
    return "badge badge--success";
  }
  if (status === "Limited Seats") {
    return "badge badge--warning";
  }
  return "badge badge--danger";
}

/**
 * Remembers the search and the filters so the booking page can come back.
 *
 * @returns {void}
 */
function saveSearchState() {
  if (!query) {
    return;
  }
  sessionStorage.setItem(SEARCH_KEY, JSON.stringify({
    origin: query.origin,
    destination: query.destination,
    date: query.date,
    className: filters.className,
    availability: filters.availability,
    sort: filters.sort
  }));
}

/**
 * Reads a saved search from this tab, if Train Search stored one.
 *
 * @returns {object | null}
 */
function readSavedSearch() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SEARCH_KEY) || "null");
    if (!saved || !saved.origin || !saved.destination || !saved.date) {
      return null;
    }
    return saved;
  } catch (error) {
    return null;
  }
}

/**
 * Fills the class filter from the trains that were actually found.
 *
 * @returns {void}
 */
function fillClassFilter() {
  const select = document.querySelector("#classFilter");
  const names = new Set();
  searchResults.forEach((train) => {
    train.classes.forEach((item) => names.add(item.className));
  });

  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All classes";
  select.append(all);

  CLASS_ORDER.filter((name) => names.has(name)).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  });

  if (!names.has(filters.className)) {
    filters.className = "";
  }
  select.value = filters.className;
}

/**
 * Draws one train card, including the class summary and the expandable seats.
 *
 * @param {object} train - Search result with its segment and class rows.
 * @returns {HTMLElement}
 */
function createTrainCard(train) {
  const article = document.createElement("article");
  article.className = "train-card";
  article.dataset.trainId = train.id;

  const top = document.createElement("div");
  top.className = "train-card__top";
  const identity = document.createElement("div");
  const number = document.createElement("p");
  number.className = "train-number";
  number.textContent = train.number;
  const title = document.createElement("h3");
  title.textContent = train.name;
  const meta = document.createElement("p");
  meta.className = "muted";
  meta.textContent = `${train.id} · ${runningDaysLabel(train.runsOn)}`;
  identity.append(number, title, meta);

  const status = headlineStatus(train);
  const badge = document.createElement("span");
  badge.className = badgeClass(status);
  badge.textContent = status;
  top.append(identity, badge);

  const route = document.createElement("div");
  route.className = "train-card__route";
  route.append(
    placeBlock(train.segment.boarding.departure, query.origin, query.date),
    durationBlock(segmentMinutes(train.segment)),
    placeBlock(
      train.segment.destination.arrival,
      query.destination,
      addDays(query.date, train.segment.destination.day - train.segment.boarding.day)
    )
  );

  const pills = document.createElement("ul");
  pills.className = "class-pills";
  train.classes.forEach((item) => {
    const pill = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${item.className} · ${formatInr(item.fare)}`;
    const mark = document.createElement("span");
    mark.className = badgeClass(item.status);
    mark.textContent = item.status;
    pill.append(label, mark);
    pills.append(pill);
  });

  const actions = document.createElement("div");
  actions.className = "train-card__actions";
  const detailsId = `availability-${train.id}`;
  const expand = document.createElement("button");
  expand.className = "btn btn--ghost";
  expand.type = "button";
  expand.dataset.expandTrain = train.id;
  expand.setAttribute("aria-expanded", String(expanded.has(train.id)));
  expand.setAttribute("aria-controls", detailsId);
  const expandLabel = document.createElement("span");
  expandLabel.dataset.expandLabel = "true";
  expandLabel.textContent = expanded.has(train.id) ? "Hide availability" : "View availability";
  expand.append(expandLabel);

  const book = document.createElement("button");
  book.className = "btn btn--primary";
  book.type = "button";
  book.dataset.bookTrain = train.id;
  book.textContent = "Book now";
  actions.append(expand, book);

  const details = document.createElement("div");
  details.className = "train-card__details";
  details.id = detailsId;
  details.hidden = !expanded.has(train.id);
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = "Seats left are this class's share of the train, minus confirmed tickets for this date. Cancelled tickets are not counted.";
  const list = document.createElement("ul");
  list.className = "fare-list";

  train.classes.forEach((item) => {
    const row = document.createElement("li");
    const choice = document.createElement("label");
    choice.className = "choice fare-choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `class-${train.id}`;
    radio.value = item.className;
    radio.checked = chosenClass.get(train.id) === item.className;
    radio.disabled = item.status === "Waiting List";
    const name = document.createElement("span");
    name.textContent = item.className;
    choice.append(radio, name);

    const seats = document.createElement("span");
    seats.textContent = `${item.remaining} seats left · ${item.booked} booked`;
    const fare = document.createElement("span");
    fare.className = "mono";
    fare.textContent = formatInr(item.fare);
    const rowBadge = document.createElement("span");
    rowBadge.className = badgeClass(item.status);
    rowBadge.textContent = item.status;
    row.append(choice, seats, fare, rowBadge);
    list.append(row);
  });

  details.append(note, list);
  article.append(top, route, pills, actions, details);
  return article;
}

/**
 * One end of the route: clock time, station, and date.
 *
 * @param {string} time - HH:MM time.
 * @param {string} station - Station name.
 * @param {string} isoDate - yyyy-mm-dd date.
 * @returns {HTMLElement}
 */
function placeBlock(time, station, isoDate) {
  const block = document.createElement("div");
  const clock = document.createElement("p");
  clock.className = "train-card__time";
  clock.textContent = formatClock(time);
  const name = document.createElement("p");
  name.className = "muted";
  name.textContent = station;
  const date = document.createElement("p");
  date.className = "muted";
  date.textContent = formatDisplayDate(isoDate);
  block.append(clock, name, date);
  return block;
}

/**
 * The duration shown between the two stations.
 *
 * @param {number} minutes - Journey length.
 * @returns {HTMLElement}
 */
function durationBlock(minutes) {
  const block = document.createElement("div");
  block.className = "train-card__duration";
  const text = document.createElement("span");
  text.textContent = formatDuration(minutes);
  block.append(text);
  return block;
}

/**
 * Shows the prompt, the loading note, an empty result, or the train cards.
 *
 * @returns {void}
 */
function renderResults() {
  if (!query) {
    return;
  }

  const prompt = document.querySelector("#searchPrompt");
  const results = document.querySelector("#results");
  const filterCard = document.querySelector("#filterCard");
  const list = document.querySelector("#resultList");
  const count = document.querySelector("#resultCount");
  prompt.hidden = true;
  results.hidden = false;
  list.replaceChildren();

  if (!searchResults.length) {
    filterCard.hidden = true;
    count.textContent = "";
    list.append(messageCard(
      "No trains found",
      emptyReason(query.origin, query.destination, query.date)
    ));
    return;
  }

  filterCard.hidden = false;
  fillClassFilter();
  const visible = applyFilters(searchResults);
  const journey = `${query.origin} to ${query.destination} · ${formatDisplayDate(query.date)}`;
  count.textContent = visible.length === 1
    ? `1 train · ${journey}`
    : `${visible.length} trains · ${journey}`;

  if (!visible.length) {
    const card = messageCard("No trains match these filters", "Try another class, availability, or sort, or reset the filters.");
    const reset = document.createElement("button");
    reset.className = "btn btn--secondary";
    reset.type = "button";
    reset.textContent = "Reset filters";
    reset.addEventListener("click", resetFilters);
    card.querySelector(".empty-state").append(reset);
    list.append(card);
    return;
  }

  visible.forEach((train) => list.append(createTrainCard(train)));
}

/**
 * Builds the empty and loading cards.
 *
 * @param {string} title - Heading.
 * @param {string} text - Supporting sentence.
 * @returns {HTMLElement}
 */
function messageCard(title, text) {
  const card = document.createElement("article");
  card.className = "card";
  const state = document.createElement("div");
  state.className = "empty-state";
  const heading = document.createElement("h3");
  heading.className = "empty-state__title";
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.className = "empty-state__text";
  copy.textContent = text;
  state.append(heading, copy);
  card.append(state);
  return card;
}

/**
 * Shows the searching state while the timetable is checked.
 *
 * @returns {void}
 */
function showLoading() {
  document.querySelector("#searchPrompt").hidden = true;
  document.querySelector("#results").hidden = false;
  document.querySelector("#filterCard").hidden = true;
  document.querySelector("#resultCount").textContent = "";
  const list = document.querySelector("#resultList");
  list.replaceChildren();
  const card = document.createElement("article");
  card.className = "card";
  card.setAttribute("aria-busy", "true");
  const body = document.createElement("div");
  body.className = "search-loading";
  const message = document.createElement("p");
  message.textContent = "Searching trains for this route.";
  const first = document.createElement("div");
  first.className = "skeleton";
  const second = document.createElement("div");
  second.className = "skeleton";
  body.append(message, first, second);
  card.append(body);
  list.append(card);
}

/**
 * Checks the three search fields and returns the canonical journey.
 *
 * @returns {{origin: string, destination: string, date: string} | null}
 */
function readSearchForm() {
  const originInput = document.querySelector("#originStation");
  const destinationInput = document.querySelector("#destinationStation");
  const dateInput = document.querySelector("#journeyDate");
  [originInput, destinationInput, dateInput].forEach(clearFieldError);

  const origin = canonicalStation(originInput.value);
  const destination = canonicalStation(destinationInput.value);
  let valid = true;

  if (!originInput.value.trim()) {
    setFieldError(originInput, "Origin station is required.");
    valid = false;
  } else if (!origin) {
    setFieldError(originInput, "Choose a station from the list.");
    valid = false;
  } else {
    originInput.value = origin;
  }

  if (!destinationInput.value.trim()) {
    setFieldError(destinationInput, "Destination station is required.");
    valid = false;
  } else if (!destination) {
    setFieldError(destinationInput, "Choose a station from the list.");
    valid = false;
  } else if (origin && origin === destination) {
    setFieldError(destinationInput, "Destination must be different from the origin station.");
    valid = false;
  } else if (destination) {
    destinationInput.value = destination;
  }

  const dateError = validateJourneyDate(dateInput.value);
  if (dateError) {
    setFieldError(dateInput, dateError === "Date is required." ? "Journey date is required." : dateError);
    valid = false;
  }

  if (!valid) {
    return null;
  }

  return { origin, destination, date: dateInput.value };
}

/**
 * Runs the search after validation and shows a short searching state.
 *
 * @returns {Promise<void>}
 */
async function runSearch() {
  const nextQuery = readSearchForm();
  if (!nextQuery) {
    return;
  }

  const token = ++searchToken;
  const button = document.querySelector("#searchTrains");
  setButtonLoading(button, true);
  showLoading();

  await new Promise((resolve) => {
    window.setTimeout(resolve, 280);
  });

  if (token !== searchToken) {
    return;
  }

  query = nextQuery;
  searchResults = searchTrains(query.origin, query.destination, query.date);
  expanded.clear();
  chosenClass.clear();
  saveSearchState();
  renderResults();
  setButtonLoading(button, false);
}

/**
 * Clears class, availability, and sort without clearing the station search.
 *
 * @returns {void}
 */
function resetFilters() {
  filters.className = "";
  filters.availability = "";
  filters.sort = "departure";
  document.querySelector("#classFilter").value = "";
  document.querySelector("#availabilityFilter").value = "";
  document.querySelector("#sortResults").value = "departure";
  saveSearchState();
  renderResults();
}

/**
 * Opens or closes the seat panel for one card.
 *
 * @param {HTMLButtonElement} button - View availability control.
 * @returns {void}
 */
function toggleAvailability(button) {
  const trainId = button.dataset.expandTrain;
  const details = document.getElementById(button.getAttribute("aria-controls"));
  if (!details) {
    return;
  }
  const willOpen = details.hidden;
  details.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
  button.querySelector("[data-expand-label]").textContent = willOpen ? "Hide availability" : "View availability";
  if (willOpen) {
    expanded.add(trainId);
  } else {
    expanded.delete(trainId);
  }
}

/**
 * Stores the selected train and class, then opens the booking page.
 * A class on the waiting list cannot be booked.
 *
 * @param {string} trainId - Train id from the Book now button.
 * @returns {void}
 */
function bookSelected(trainId) {
  const train = searchResults.find((item) => item.id === trainId);
  const className = chosenClass.get(trainId);
  if (!train || !className) {
    showToast("Choose a class on this train before booking.", "error");
    const button = document.querySelector(`[data-expand-train="${trainId}"]`);
    if (button && button.getAttribute("aria-expanded") !== "true") {
      toggleAvailability(button);
    }
    return;
  }

  const selected = train.classes.find((item) => item.className === className);
  if (!selected || selected.status === "Waiting List") {
    showToast("This class has no seats left.", "error");
    return;
  }

  const nights = train.segment.destination.day - train.segment.boarding.day;
  const draft = {
    trainId: train.id,
    trainNumber: train.number,
    trainName: train.name,
    origin: query.origin,
    destination: query.destination,
    journeyDate: query.date,
    departureTime: train.segment.boarding.departure,
    arrivalTime: train.segment.destination.arrival,
    arrivalDate: addDays(query.date, nights),
    selectedClass: selected.className,
    fare: selected.fare,
    availability: selected.status,
    seatsRemaining: selected.remaining,
    seatsBooked: selected.booked,
    capacity: selected.capacity
  };

  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  saveSearchState();
  window.location.href = "ticket-booking.html";
}

/**
 * Station suggestions for one field.
 * Typing filters stations.json. Arrow keys move through the list,
 * and Enter or a click writes the station name into the field.
 *
 * @param {HTMLInputElement} input - Origin or destination field.
 * @param {HTMLElement} list - Suggestion list for that field.
 * @returns {void}
 */
function bindStationField(input, list) {
  let active = -1;
  let matches = [];

  function closeList() {
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
    matches = [];
  }

  function setActive(index) {
    const options = [...list.querySelectorAll(".station-list__option")];
    options.forEach((option, optionIndex) => {
      const selected = optionIndex === index;
      option.classList.toggle("is-active", selected);
      option.setAttribute("aria-selected", String(selected));
    });
    active = index;
    if (options[index]) {
      input.setAttribute("aria-activedescendant", options[index].id);
      options[index].scrollIntoView({ block: "nearest" });
    }
  }

  function choose(name) {
    input.value = name;
    clearFieldError(input);
    closeList();
  }

  function openList(items) {
    matches = items;
    list.replaceChildren();
    if (!items.length) {
      closeList();
      return;
    }

    items.forEach((name, index) => {
      const item = document.createElement("li");
      item.setAttribute("role", "presentation");
      const option = document.createElement("button");
      option.type = "button";
      option.className = "station-list__option";
      option.id = `${input.id}-option-${index}`;
      option.setAttribute("role", "option");
      option.textContent = name;
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(name);
      });
      item.append(option);
      list.append(item);
    });

    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(0);
  }

  const refresh = debounce(() => {
    const typed = input.value.trim().toLowerCase();
    if (!typed || canonicalStation(input.value) === input.value.trim()) {
      closeList();
      return;
    }
    const starts = stations.filter((name) => name.toLowerCase().startsWith(typed));
    const contains = stations.filter((name) => !name.toLowerCase().startsWith(typed) && name.toLowerCase().includes(typed));
    openList([...starts, ...contains].slice(0, 8));
  }, 120);

  input.addEventListener("input", () => {
    clearFieldError(input);
    refresh();
  });

  input.addEventListener("keydown", (event) => {
    if (list.hidden) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(active + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(active - 1, 0));
    } else if (event.key === "Enter" && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape") {
      closeList();
    }
  });

  input.addEventListener("blur", () => {
    window.setTimeout(closeList, 150);
  });
}

/**
 * Connects the search form, filters, cards, and a saved search from this tab.
 *
 * @returns {Promise<void>}
 */
async function startTrainSearch() {
  if (!session) {
    return;
  }

  mountCustomerNav("search");
  document.querySelector("#journeyDate").min = todayIso();

  try {
    await prepareStorage();
  } catch (error) {
    const alert = document.querySelector("#pageAlert");
    alert.hidden = false;
    alert.textContent = "Station and train data could not be loaded. Open this site with Live Server.";
    return;
  }

  stations = getStations();
  bindStationField(document.querySelector("#originStation"), document.querySelector("#originList"));
  bindStationField(document.querySelector("#destinationStation"), document.querySelector("#destinationList"));

  document.querySelector("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch();
  });

  document.querySelector("#classFilter").addEventListener("change", (event) => {
    filters.className = event.target.value;
    saveSearchState();
    renderResults();
  });
  document.querySelector("#availabilityFilter").addEventListener("change", (event) => {
    filters.availability = event.target.value;
    saveSearchState();
    renderResults();
  });
  document.querySelector("#sortResults").addEventListener("change", (event) => {
    filters.sort = event.target.value;
    saveSearchState();
    renderResults();
  });
  document.querySelector("#resetFilters").addEventListener("click", resetFilters);

  document.querySelector("#resultList").addEventListener("click", (event) => {
    const expand = event.target.closest("[data-expand-train]");
    if (expand) {
      toggleAvailability(expand);
      return;
    }
    const book = event.target.closest("[data-book-train]");
    if (book) {
      bookSelected(book.dataset.bookTrain);
    }
  });

  document.querySelector("#resultList").addEventListener("change", (event) => {
    const radio = event.target;
    if (radio instanceof HTMLInputElement && radio.type === "radio") {
      const trainId = radio.name.replace("class-", "");
      chosenClass.set(trainId, radio.value);
    }
  });

  const saved = readSavedSearch();
  if (!saved) {
    return;
  }

  document.querySelector("#originStation").value = saved.origin;
  document.querySelector("#destinationStation").value = saved.destination;
  document.querySelector("#journeyDate").value = saved.date;
  filters.className = saved.className || "";
  filters.availability = saved.availability || "";
  filters.sort = saved.sort || "departure";
  document.querySelector("#availabilityFilter").value = filters.availability;
  document.querySelector("#sortResults").value = filters.sort;
  runSearch();
}

startTrainSearch();
