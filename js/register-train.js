/**
 * Register a Train.
 *
 * The form saves a train into the same timetable Train Search reads.
 * Search needs running days, times, and a fare for each class, which this
 * form does not collect. A registered train therefore runs every day,
 * leaves at 08:00, arrives at 18:00, and uses the standard class fares.
 */

import { requireAdmin } from "./auth.js";
import { clearFieldError, setFieldError, showToast } from "./common.js";
import { mountAdminNav } from "./admin-nav.js";
import { getStations, getTrains, prepareStorage, saveTrains } from "./storage.js";
import { validateRequired } from "./validation.js";

/**
 * Fares used when the registration form does not collect a fare.
 * The names match the classes already used by booking and search.
 */
const STANDARD_FARES = {
  "First Class": 2500,
  "AC Tier 1": 1800,
  "AC Tier 2": 1200,
  "Tatkal": 1500
};

const session = requireAdmin();

/**
 * Puts the stored stations into both station lists.
 *
 * @returns {void}
 */
function fillStations() {
  const stations = getStations().slice().sort((left, right) => left.localeCompare(right));
  ["#sourceStation", "#destinationStation"].forEach((selector) => {
    const select = document.querySelector(selector);
    const placeholder = select.querySelector("option");
    select.replaceChildren(placeholder);
    stations.forEach((station) => {
      const option = document.createElement("option");
      option.value = station;
      option.textContent = station;
      select.append(option);
    });
  });
}

/**
 * Chooses a train number that is not already in the timetable.
 *
 * @param {Array} trains - Trains already stored.
 * @returns {string} A numeric train number.
 */
function nextTrainNumber(trains) {
  const used = trains
    .map((train) => Number(String(train.number || "").replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value));
  return String(Math.max(10000, ...used, 0) + 1);
}

/**
 * Checks that the seat count is a positive whole number.
 *
 * @param {string} value - Seats typed into the form.
 * @returns {string} An error message, or an empty string when the count is valid.
 */
function validateSeats(value) {
  const seats = String(value || "").trim();
  if (!seats) {
    return "Number of seats is required.";
  }
  if (!/^[1-9][0-9]*$/.test(seats)) {
    return "Number of seats must be a whole number of at least 1.";
  }
  return "";
}

/**
 * Checks every registration field.
 *
 * @returns {HTMLElement | null} The first invalid field, or null when the train can be saved.
 */
function validateTrainForm() {
  const name = document.querySelector("#trainName");
  const seats = document.querySelector("#seatCount");
  const source = document.querySelector("#sourceStation");
  const destination = document.querySelector("#destinationStation");
  const ownership = document.querySelector("#ownership");

  const fields = [
    [name, validateRequired(name.value, "Train name")],
    [seats, validateSeats(seats.value)],
    [source, validateRequired(source.value, "Source station")],
    [destination, validateRequired(destination.value, "Destination station")],
    [ownership, validateRequired(ownership.value, "Train ownership")]
  ];

  if (source.value && destination.value && source.value === destination.value) {
    fields[3][1] = "Destination must be different from the source station.";
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
 * Saves the train and makes its stations available to Train Search.
 *
 * @param {SubmitEvent} event - Registration form submission.
 * @returns {void}
 */
function saveTrain(event) {
  event.preventDefault();
  const firstInvalid = validateTrainForm();
  if (firstInvalid) {
    firstInvalid.focus();
    showToast("Check the highlighted fields.", "error");
    return;
  }

  const trains = getTrains();
  const number = nextTrainNumber(trains);
  const source = document.querySelector("#sourceStation").value;
  const destination = document.querySelector("#destinationStation").value;
  const train = {
    id: `TRN-${number}`,
    number,
    name: document.querySelector("#trainName").value.trim(),
    ownership: document.querySelector("#ownership").value.trim(),
    seats: Number(document.querySelector("#seatCount").value),
    runsOn: [0, 1, 2, 3, 4, 5, 6],
    fares: { ...STANDARD_FARES },
    stops: [
      { name: source, arrival: "", departure: "08:00", day: 0 },
      { name: destination, arrival: "18:00", departure: "", day: 0 }
    ]
  };

  trains.push(train);
  saveTrains(trains);
  event.target.reset();
  showToast(`${train.number} ${train.name} was registered.`);

  const notice = document.querySelector("#saveNotice");
  notice.hidden = false;
  notice.textContent = `${train.number} ${train.name} is in the timetable. It runs daily from ${source} at 8:00 AM to ${destination} at 6:00 PM, so Train Search can list it.`;
}

/**
 * Opens the registration form for an administrator.
 *
 * @returns {Promise<void>}
 */
async function startRegisterTrain() {
  if (!session) {
    return;
  }

  mountAdminNav("register");

  try {
    await prepareStorage();
  } catch (error) {
    const alert = document.querySelector("#pageAlert");
    alert.hidden = false;
    alert.textContent = "Station and train data could not be loaded. Open this site with Live Server.";
    return;
  }

  fillStations();
  document.querySelector("#trainForm").addEventListener("submit", saveTrain);
}

startRegisterTrain();
