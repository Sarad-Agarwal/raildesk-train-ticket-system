/**
 * RailDesk shared interface behaviour.
 *
 * Include this file on every page. It binds the widgets defined in common.css:
 * menus, modals, toasts, password reveal, station swap, seat selection,
 * filter chips, and expandable train cards.
 *
 * Page scripts should import only the helper they need. The RailDesk global
 * is also set so a page can call the helpers from a plain script while learning
 * the code. Booking, login, and admin rules do not belong in this file.
 */

"use strict";

/** Selector for controls that can receive keyboard focus inside a dialog. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(", ");

/** The modal currently open, or null when no dialog is showing. */
let activeModal = null;

/** Element that had focus before the modal opened, restored on close. */
let lastFocus = null;

/** Live region that holds toast notifications. */
let toastRegion = null;

/**
 * Runs a callback once the document has been parsed.
 * Module scripts can execute after DOMContentLoaded, so the ready state
 * is checked instead of always waiting for the event.
 *
 * @param {function(): void} callback - Function to run when the DOM is ready.
 * @returns {void}
 */
function whenReady(callback) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback);
  } else {
    callback();
  }
}

/**
 * Binds every shared widget once.
 * A data attribute stops a second import from attaching duplicate listeners.
 *
 * @returns {void}
 */
export function initCommonUi() {
  if (document.documentElement.dataset.uiReady === "true") {
    return;
  }

  document.documentElement.dataset.uiReady = "true";
  ensureToastRegion();
  initPublicNav();
  initShell();
  initPasswordToggles();
  initStationSwap();
  initSeatSelection();
  initChipGroups();
  initTrainCards();
  initKeyboard();
}

/**
 * Creates the toast container when a page did not include one.
 * The region uses aria-live so assistive technology announces new messages.
 *
 * @returns {HTMLElement} The toast region element.
 */
function ensureToastRegion() {
  toastRegion = document.querySelector(".toast-region");

  if (!toastRegion) {
    toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    toastRegion.setAttribute("aria-live", "polite");
    toastRegion.setAttribute("aria-relevant", "additions");
    document.body.appendChild(toastRegion);
  }

  return toastRegion;
}

/**
 * Shows a short confirmation or error message.
 * The toast removes itself after a few seconds, or sooner if dismissed.
 *
 * @param {string} message - Text to show. It is inserted as text, not HTML.
 * @param {"success" | "error" | "info"} [variant="success"] - Colour of the accent bar.
 * @returns {void}
 */
export function showToast(message, variant = "success") {
  ensureToastRegion();

  const toast = document.createElement("div");
  const text = document.createElement("p");
  const closeButton = document.createElement("button");

  toast.className = `toast toast--${variant}`;
  toast.setAttribute("role", "status");
  text.textContent = message;

  closeButton.type = "button";
  closeButton.className = "toast__close";
  closeButton.setAttribute("aria-label", "Dismiss notification");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => removeToast(toast));

  toast.append(text, closeButton);
  toastRegion.appendChild(toast);

  const timer = window.setTimeout(() => removeToast(toast), 4200);
  toast.dataset.timer = String(timer);
}

/**
 * Removes one toast after its exit state, and cancels the auto-dismiss timer.
 *
 * @param {HTMLElement} toast - Toast element created by showToast.
 * @returns {void}
 */
function removeToast(toast) {
  window.clearTimeout(Number(toast.dataset.timer));
  toast.classList.add("is-leaving");
  window.setTimeout(() => toast.remove(), 180);
}

/**
 * Opens a modal and moves focus into its dialog.
 * If another modal is open, that modal is closed first.
 *
 * @param {string} modalId - Id of the .modal element to open.
 * @returns {void}
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) {
    return;
  }

  if (activeModal && activeModal !== modal) {
    closeModal(activeModal.id);
  }

  lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  activeModal = modal;

  const dialog = modal.querySelector(".modal__dialog");
  const preferred = dialog && (dialog.querySelector("[data-initial-focus]") || dialog.querySelector(FOCUSABLE));
  if (preferred) {
    preferred.focus();
  }
}

/**
 * Closes a modal and returns focus to the control that opened it.
 *
 * @param {string} [modalId] - Id of the modal to close. Defaults to the open modal.
 * @returns {void}
 */
export function closeModal(modalId) {
  const modal = modalId ? document.getElementById(modalId) : activeModal;
  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove("modal-open");

  if (activeModal === modal) {
    activeModal = null;
  }

  if (lastFocus && typeof lastFocus.focus === "function") {
    lastFocus.focus();
  }
}

/**
 * Wires modal open and close controls.
 * A control needs data-open-modal="theModalId" or data-close-modal.
 * Listening on the document lets later pages add dialogs without rebinding.
 *
 * @returns {void}
 */
function initModals() {
  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open-modal]");
    if (opener) {
      event.preventDefault();
      openModal(opener.getAttribute("data-open-modal"));
      return;
    }

    const closer = event.target.closest("[data-close-modal]");
    if (closer) {
      const modal = closer.closest(".modal");
      if (modal) {
        closeModal(modal.id);
      }
    }
  });
}

/**
 * Keeps keyboard focus inside the open dialog while Tab is pressed.
 *
 * @param {KeyboardEvent} event - The Tab key event.
 * @returns {void}
 */
function trapModalTab(event) {
  const dialog = activeModal.querySelector(".modal__dialog") || activeModal;
  const items = Array.from(dialog.querySelectorAll(FOCUSABLE));
  if (!items.length) {
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Handles Escape and Tab for the topmost layer.
 * Escape closes a modal first, then a mobile sidebar, then the public menu.
 *
 * @returns {void}
 */
function initKeyboard() {
  initModals();

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (activeModal) {
        closeModal(activeModal.id);
        return;
      }

      document.querySelectorAll(".app.sidebar-open").forEach((app) => {
        app.classList.remove("sidebar-open");
        syncSidebarToggle(app);
      });

      document.querySelectorAll(".public-header.is-open").forEach((header) => {
        header.classList.remove("is-open");
        const toggle = header.querySelector("[data-nav-toggle]");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
        }
      });
      return;
    }

    if (event.key === "Tab" && activeModal) {
      trapModalTab(event);
    }
  });
}

/**
 * Opens and closes the public header menu on small screens.
 * The button uses data-nav-toggle and aria-expanded.
 *
 * @returns {void}
 */
function initPublicNav() {
  document.querySelectorAll("[data-nav-toggle]").forEach((button) => {
    const header = button.closest(".public-header");
    if (!header) {
      return;
    }

    button.addEventListener("click", () => {
      const open = header.classList.toggle("is-open");
      button.setAttribute("aria-expanded", String(open));
    });

    header.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        header.classList.remove("is-open");
        button.setAttribute("aria-expanded", "false");
      });
    });
  });
}

/**
 * Updates the shell menu button to match whether the sidebar is visible.
 * On a wide screen the sidebar is visible unless .sidebar-collapsed is set.
 * On a narrow screen it is visible only when .sidebar-open is set.
 *
 * @param {HTMLElement} app - The .app element that owns the sidebar.
 * @returns {void}
 */
function syncSidebarToggle(app) {
  const toggle = app.querySelector("[data-sidebar-toggle]");
  if (!toggle) {
    return;
  }

  const mobile = window.matchMedia("(max-width: 1100px)").matches;
  const open = mobile
    ? app.classList.contains("sidebar-open")
    : !app.classList.contains("sidebar-collapsed");

  toggle.setAttribute("aria-expanded", String(open));
}

/**
 * Binds the application sidebar toggle and the dimmed backdrop.
 * Crossing the 1100px breakpoint clears the other layout's open state so a
 * desktop collapse does not leave the mobile drawer at zero width.
 *
 * @returns {void}
 */
function initShell() {
  const mobileQuery = window.matchMedia("(max-width: 1100px)");

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-sidebar-toggle]");
    const closer = event.target.closest("[data-sidebar-close]");
    if (!toggle && !closer) {
      return;
    }

    const app = (toggle || closer).closest(".app");
    if (!app) {
      return;
    }

    if (closer) {
      app.classList.remove("sidebar-open");
      syncSidebarToggle(app);
      return;
    }

    if (mobileQuery.matches) {
      app.classList.toggle("sidebar-open");
    } else {
      app.classList.toggle("sidebar-collapsed");
    }

    syncSidebarToggle(app);
  });

  mobileQuery.addEventListener("change", () => {
    document.querySelectorAll(".app").forEach((app) => {
      if (mobileQuery.matches) {
        app.classList.remove("sidebar-collapsed");
      } else {
        app.classList.remove("sidebar-open");
      }
      syncSidebarToggle(app);
    });
  });

  document.querySelectorAll(".app").forEach(syncSidebarToggle);
}

/**
 * Shows or hides a password without removing the typed value.
 * The button uses data-password-toggle="idOfTheInput".
 *
 * @returns {void}
 */
function initPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const input = document.getElementById(button.getAttribute("data-password-toggle"));
      if (!input) {
        return;
      }

      const willShow = input.type === "password";
      input.type = willShow ? "text" : "password";
      button.setAttribute("aria-pressed", String(willShow));
      button.textContent = willShow ? "Hide" : "Show";
    });
  });
}

/**
 * Exchanges the values of the origin and destination fields.
 * The button uses data-station-swap, data-from, and data-to.
 * An input event is dispatched so later autocomplete code can react.
 *
 * @returns {void}
 */
function initStationSwap() {
  document.querySelectorAll("[data-station-swap]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const from = document.getElementById(button.getAttribute("data-from"));
      const to = document.getElementById(button.getAttribute("data-to"));
      if (!from || !to) {
        return;
      }

      const previous = from.value;
      from.value = to.value;
      to.value = previous;
      from.dispatchEvent(new Event("input", { bubbles: true }));
      to.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

/**
 * Lets a person select an available seat.
 * Occupied seats are ignored. The selected class is what the booking page
 * will read when it builds the passenger list.
 *
 * @param {ParentNode} [root=document] - Limits the search when a coach is redrawn.
 * @returns {void}
 */
export function initSeatSelection(root = document) {
  root.querySelectorAll("button.seat").forEach((seat) => {
    if (seat.dataset.bound === "true") {
      return;
    }

    seat.dataset.bound = "true";

    if (!seat.classList.contains("seat--occupied") && !seat.classList.contains("seat--selected")) {
      seat.classList.add("seat--available");
    }

    seat.setAttribute("aria-pressed", String(seat.classList.contains("seat--selected")));

    seat.addEventListener("click", () => {
      if (seat.classList.contains("seat--occupied") || seat.disabled) {
        return;
      }

      const selected = !seat.classList.contains("seat--selected");
      seat.classList.toggle("seat--selected", selected);
      seat.classList.toggle("seat--available", !selected);
      seat.setAttribute("aria-pressed", String(selected));
    });
  });
}

/**
 * Toggles filter chips inside a group.
 * data-chip-mode="multiple" allows several active chips. Any other value
 * keeps a single active chip, and clicking it again clears the choice.
 *
 * @param {ParentNode} [root=document] - Limits the search to one toolbar.
 * @returns {void}
 */
export function initChipGroups(root = document) {
  root.querySelectorAll("[data-chip-group]").forEach((group) => {
    const single = group.getAttribute("data-chip-mode") !== "multiple";

    group.querySelectorAll(".chip").forEach((chip) => {
      if (chip.dataset.bound === "true") {
        return;
      }
      chip.dataset.bound = "true";

      if (!chip.hasAttribute("aria-pressed")) {
        chip.setAttribute("aria-pressed", String(chip.classList.contains("chip--active")));
      }

      chip.addEventListener("click", () => {
        const wasActive = chip.classList.contains("chip--active");

        if (single) {
          group.querySelectorAll(".chip").forEach((item) => {
            item.classList.remove("chip--active");
            item.setAttribute("aria-pressed", "false");
          });
        }

        const active = single ? !wasActive : !wasActive;
        chip.classList.toggle("chip--active", active);
        chip.setAttribute("aria-pressed", String(active));
      });
    });
  });
}

/**
 * Opens and closes the availability panel on a train card.
 * The button uses data-expand-train. The panel is .train-card__details.
 *
 * @returns {void}
 */
function initTrainCards() {
  document.querySelectorAll("[data-expand-train]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      const card = button.closest(".train-card");
      const details = card && card.querySelector(".train-card__details");
      if (!details) {
        return;
      }

      const willOpen = details.hidden;
      details.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));

      const label = button.querySelector("[data-expand-label]");
      const text = willOpen ? "Hide availability" : "View availability";
      if (label) {
        label.textContent = text;
      } else {
        button.textContent = text;
      }
    });
  });
}

/**
 * Marks a field invalid and shows a message in its .field__error element.
 *
 * @param {HTMLElement} input - The input, select, or textarea.
 * @param {string} message - Validation message people should correct.
 * @returns {void}
 */
export function setFieldError(input, message) {
  const field = input.closest(".field");
  const error = field && field.querySelector(".field__error");

  input.classList.add("is-invalid");
  input.setAttribute("aria-invalid", "true");

  if (!error) {
    return;
  }

  error.textContent = message;
  error.hidden = false;

  if (!error.id) {
    error.id = `${input.id || "field"}-error`;
  }

  input.setAttribute("aria-describedby", error.id);
}

/**
 * Clears the invalid state and the message set by setFieldError.
 *
 * @param {HTMLElement} input - The control to reset.
 * @returns {void}
 */
export function clearFieldError(input) {
  const field = input.closest(".field");
  const error = field && field.querySelector(".field__error");

  input.classList.remove("is-invalid");
  input.removeAttribute("aria-invalid");

  if (!error) {
    return;
  }

  error.textContent = "";
  error.hidden = true;
}

/**
 * Shows or hides the loading spinner on a button and disables it while busy.
 * The original label stays in the button and reappears when loading ends.
 *
 * @param {HTMLButtonElement} button - Button that represents the in-progress action.
 * @param {boolean} isLoading - True while the action is running.
 * @returns {void}
 */
export function setButtonLoading(button, isLoading) {
  button.classList.toggle("is-loading", isLoading);
  button.disabled = isLoading;
  button.setAttribute("aria-busy", String(isLoading));
}

/**
 * Formats a rupee amount for display.
 *
 * @param {number} amount - Amount in rupees.
 * @returns {string} A value such as "₹1,845".
 */
export function formatInr(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(amount) || 0);
}

/**
 * Formats an ISO date for tickets and search results.
 *
 * @param {string} isoDate - A yyyy-mm-dd date.
 * @returns {string} A value such as "18 Nov 2026", or an empty string when invalid.
 */
export function formatDisplayDate(isoDate) {
  if (!isoDate) {
    return "";
  }

  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

/**
 * Formats a 24-hour clock time for display.
 *
 * @param {string} time24 - A HH:MM time.
 * @returns {string} A value such as "6:40 PM". Unrecognised input is returned unchanged.
 */
export function formatClock(time24) {
  const match = /^(\d{2}):(\d{2})$/.exec(time24 || "");
  if (!match) {
    return time24 || "";
  }

  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/**
 * Delays a function until calls stop arriving.
 * Station autocomplete will use this so a search does not run on every keystroke.
 *
 * @param {Function} fn - Function to delay.
 * @param {number} [wait=250] - Quiet period in milliseconds.
 * @returns {Function} A wrapped function with the same arguments.
 */
export function debounce(fn, wait = 250) {
  let timer = 0;

  return function debounced(...args) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Reads one query-string value from the current page address.
 * The booking pages will use this to carry the selected train and date.
 *
 * @param {string} name - Parameter name.
 * @returns {string | null} The value, or null when the parameter is absent.
 */
export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

window.RailDesk = {
  initCommonUi,
  openModal,
  closeModal,
  showToast,
  setFieldError,
  clearFieldError,
  setButtonLoading,
  initSeatSelection,
  initChipGroups,
  formatInr,
  formatDisplayDate,
  formatClock,
  debounce,
  getQueryParam
};

whenReady(initCommonUi);
