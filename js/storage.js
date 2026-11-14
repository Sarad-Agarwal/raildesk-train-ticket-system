/**
 * Browser storage for the demonstration.
 *
 * The JSON files in /data are the starting records. A browser cannot write
 * those files, so the first visit copies them into localStorage. Later
 * bookings and registrations change only localStorage.
 *
 * Passwords are stored in plain text so the class demonstration can sign in
 * again. This is not production authentication.
 */

const SEED_VERSION = "1";
const VERSION_KEY = "raildesk_seed_version";

const KEYS = {
  customers: "raildesk_customers",
  bookings: "raildesk_bookings",
  trains: "raildesk_trains",
  stations: "raildesk_stations",
  admins: "raildesk_admins"
};

/**
 * Chooses the JSON folder for the current page.
 * Pages inside /pages need to step up one directory. The login page does not.
 *
 * @returns {string} Relative path ending with a slash.
 */
function dataBase() {
  const path = window.location.pathname.replace(/\\/g, "/");
  return path.includes("/pages/") ? "../data/" : "data/";
}

/**
 * Loads one seed file.
 *
 * @param {string} fileName - File inside the data folder.
 * @returns {Promise<any>} The parsed JSON value.
 */
async function readJson(fileName) {
  const response = await fetch(`${dataBase()}${fileName}`);
  if (!response.ok) {
    throw new Error(`The data file ${fileName} could not be loaded.`);
  }
  return response.json();
}

/**
 * Copies the JSON seed into localStorage when this browser has no copy yet.
 * An existing copy is left unchanged so a new booking is not wiped on refresh.
 *
 * @returns {Promise<void>}
 */
export async function prepareStorage() {
  const ready = localStorage.getItem(VERSION_KEY) === SEED_VERSION
    && localStorage.getItem(KEYS.customers)
    && localStorage.getItem(KEYS.trains);

  if (ready) {
    return;
  }

  const [customers, bookings, trains, stations, admins] = await Promise.all([
    readJson("customers.json"),
    readJson("bookings.json"),
    readJson("trains.json"),
    readJson("stations.json"),
    readJson("admin.json")
  ]);

  localStorage.setItem(KEYS.customers, JSON.stringify(customers));
  localStorage.setItem(KEYS.bookings, JSON.stringify(bookings));
  localStorage.setItem(KEYS.trains, JSON.stringify(trains));
  localStorage.setItem(KEYS.stations, JSON.stringify(stations));
  localStorage.setItem(KEYS.admins, JSON.stringify(admins));
  localStorage.setItem(VERSION_KEY, SEED_VERSION);
}

/**
 * Reads an array saved by prepareStorage.
 *
 * @param {string} key - localStorage key.
 * @returns {Array} The saved array, or an empty array when the value is missing.
 */
function readList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

/**
 * Replaces one saved array.
 *
 * @param {string} key - localStorage key.
 * @param {Array} list - Records to keep.
 * @returns {void}
 */
function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

/** @returns {Array} Registered customers. */
export function getCustomers() {
  return readList(KEYS.customers);
}

/**
 * Saves the customer list after registration.
 *
 * @param {Array} customers - Full customer list.
 * @returns {void}
 */
export function saveCustomers(customers) {
  writeList(KEYS.customers, customers);
}

/** @returns {Array} Bookings for every customer. */
export function getBookings() {
  return readList(KEYS.bookings);
}

/**
 * Saves the booking list after a customer books or, later, cancels.
 *
 * @param {Array} bookings - Full booking list.
 * @returns {void}
 */
export function saveBookings(bookings) {
  writeList(KEYS.bookings, bookings);
}

/** @returns {Array} Trains, including any an admin registers later. */
export function getTrains() {
  return readList(KEYS.trains);
}

/**
 * Saves the timetable after an administrator registers a train.
 *
 * @param {Array} trains - Full train list.
 * @returns {void}
 */
export function saveTrains(trains) {
  writeList(KEYS.trains, trains);
}

/** @returns {Array<string>} Station names for the booking form. */
export function getStations() {
  return readList(KEYS.stations);
}

/** @returns {Array} Administrator accounts. */
export function getAdmins() {
  return readList(KEYS.admins);
}

/**
 * Saves administrator accounts after profile changes.
 *
 * @param {Array} admins - Full administrator list.
 * @returns {void}
 */
export function saveAdmins(admins) {
  writeList(KEYS.admins, admins);
}
