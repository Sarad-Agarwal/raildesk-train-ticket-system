/**
 * Opens a customer section that is linked from the home page but not built yet.
 * Train Search, View Ticket, and Update Details have their own pages.
 */

import { requireCustomer } from "./auth.js";
import "./common.js";
import { mountCustomerNav } from "./customer-nav.js";

const session = requireCustomer();
if (session) {
  mountCustomerNav(document.body.dataset.nav || "home");
}
