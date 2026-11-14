# RailDesk — Train Ticket Booking System

RailDesk is a Train Ticket Booking System frontend developed using **HTML5, CSS3 and Vanilla JavaScript**.

The application provides separate Customer and Admin portals with train search, seat availability, ticket booking, passenger management, booking history, ticket cancellation, customer management and train registration.

The original TRAIN TICKET SYSTEM project documentation is the primary source of application requirements.

---

## 1. Technology Stack

- HTML5
- CSS3
- Vanilla JavaScript (ES6+)
- JSON for dummy datasets
- LocalStorage for browser-side data persistence
- SessionStorage for login sessions

No frontend frameworks are used.

## 2. How to Run the Project

### Using VS Code Live Server (Recommended)

1. Open the project folder in Visual Studio Code.
2. Install the Live Server extension if it is not already installed.
3. Right-click `index.html`.
4. Select **Open with Live Server**.
5. The application will open automatically in your browser.

### Using Python HTTP Server

Open the terminal inside the project folder and execute:

```bash
python -m http.server 5500
```

Then open:

http://localhost:5500

**Important:** Always run the application through a local server. Opening HTML files directly using `file://` may prevent the browser from loading JSON datasets.

## 3. Application Modules

### A. Customer Portal

The Customer Portal provides the following functionalities:

**1. Login and Registration**
- Customer login using username and password.
- Customer account registration.
- Username validation.
- Password validation.
- Confirm password validation.
- Email validation.
- Mobile number validation.
- Aadhaar field validation for required input.

**2. Customer Dashboard**
- Number of tickets booked per class.
- Quarterly sales statistics.
- Book Ticket form.
- Automatically populated customer ID.
- Passenger and journey information.
- Navigation to customer modules.

**3. Train Search and Seat Availability**
- Search trains by origin station.
- Search trains by destination station.
- Select journey date.
- Display matching trains.
- Show departure and arrival information.
- Display seat availability by class.
- Expandable train details.
- Direct booking option.

**4. Ticket Booking**
- Retain selected train and class information.
- Enter passenger details.
- Select seats.
- Validate passenger information.
- Demonstration payment interface.
- Complete the booking workflow.

**5. Booking Confirmation**
- Booking ID.
- Train ID and train information.
- Passenger details.
- Boarding and destination stations.
- Journey date and timings.
- Seat and class information.
- Booking status.
- Navigation to other customer features.

**6. View Tickets and Booking History**
- Ticket ID.
- Train ID.
- User ID.
- User name.
- Boarding station.
- Destination station.
- Boarding date and time.
- Arrival date and time.
- Number of tickets.
- Cancel Ticket functionality.
- Cancellation confirmation modal.
- Booking search and filters.

**7. Update Details**
- Email address.
- Mobile number.
- Address.
- Current password.
- New password.
- Confirm password.
- Password validation according to registration requirements.

### B. Admin Portal

The Admin Portal provides the following functionalities:

**1. Admin Dashboard**
- Number of tickets booked per class.
- Quarterly sales statistics.
- Customer information table.
- Customer ID.
- Customer name.
- Mobile number.
- Number of tickets booked.
- Delete customer functionality.
- Customer deletion confirmation modal.

**2. Register a Train**

Administrators can register trains using:

- Train name.
- Number of seats.
- Source station (From).
- Destination station (To).
- Train ownership.

Registered train information is intended to be available to the customer train-search module.

**3. Admin Profile**
- Username.
- Password.
- Mobile number.
- Email ID.
- Update administrator information.

**4. Logout**
- Clear the administrator session.
- Redirect to the login page.

## 4. Main Booking Workflow

The separate train-search booking workflow follows:

**Train Search → Select Train and Class → Passenger Details → Seat Selection → Payment → Booking Confirmation → View Ticket**

The Customer Dashboard also provides a separate Book Ticket form as specified in the original project documentation.

## 5. Demo Accounts

The following demonstration accounts are provided:

| Portal | Username | Password |
|---|---|---|
| Customer | `aaravmehta` | `Travel@123` |
| Customer | `meeraiyer` | `Travel@123` |
| Admin | `adminuser` | `Admin@123` |

These credentials are intended for local project demonstration.

## 6. Project Folder Structure

The project is organized into separate folders for assets, CSS, JSON data, JavaScript functionality and HTML pages.

```text
Train Ticket System/
│
├── assets/
│   └── mark.svg
│
├── css/
│   ├── auth.css
│   ├── booking.css
│   ├── common.css
│   ├── dashboard.css
│   ├── premium.css
│   ├── profile.css
│   ├── responsive.css
│   ├── search.css
│   └── tickets.css
│
├── data/
│   ├── admin.json
│   ├── bookings.json
│   ├── customers.json
│   ├── stations.json
│   └── trains.json
│
├── js/
│   ├── admin-dashboard.js
│   ├── admin-nav.js
│   ├── admin-profile.js
│   ├── auth.js
│   ├── booking-confirmation.js
│   ├── common.js
│   ├── customer-dashboard.js
│   ├── customer-nav.js
│   ├── login.js
│   ├── register-train.js
│   ├── register.js
│   ├── section-page.js
│   ├── storage.js
│   ├── ticket-booking.js
│   ├── train-search.js
│   ├── update-details.js
│   ├── validation.js
│   └── view-tickets.js
│
├── pages/
│   ├── admin-dashboard.html
│   ├── admin-profile.html
│   ├── booking-confirmation.html
│   ├── customer-dashboard.html
│   ├── design-system.html
│   ├── register-train.html
│   ├── register.html
│   ├── ticket-booking.html
│   ├── train-search.html
│   ├── update-details.html
│   └── view-tickets.html
│
├── index.html
└── README.md
```

### Folder Descriptions

| Folder | Purpose |
|---|---|
| `assets/` | Application logo and visual assets |
| `css/` | Stylesheets for layouts, components and responsive design |
| `data/` | JSON datasets for trains, stations, customers, bookings and admin |
| `js/` | Application logic, validation, authentication and interactions |
| `pages/` | Customer and Admin HTML pages |

### Important JavaScript Files

| File | Purpose |
|---|---|
| `auth.js` | Authentication and session management |
| `login.js` | Login functionality |
| `register.js` | Customer registration |
| `storage.js` | JSON seed data and LocalStorage operations |
| `validation.js` | Form validation |
| `common.js` | Shared UI interactions and helpers |
| `customer-dashboard.js` | Customer dashboard functionality |
| `customer-nav.js` | Customer navigation |
| `admin-dashboard.js` | Admin dashboard functionality |
| `admin-nav.js` | Admin navigation |
| `admin-profile.js` | Admin profile management |
| `register-train.js` | Train registration |
| `train-search.js` | Train search and availability |
| `ticket-booking.js` | Passenger details and seat booking |
| `booking-confirmation.js` | Booking confirmation display |
| `view-tickets.js` | Ticket listing, search, filters and cancellation |
| `update-details.js` | Customer profile and password updates |
| `section-page.js` | Shared section-page functionality |

## 7. Data Management

The application uses JSON files as initial datasets.

| JSON File | Purpose |
|---|---|
| `admin.json` | Administrator demonstration data |
| `bookings.json` | Initial booking records |
| `customers.json` | Customer demonstration data |
| `stations.json` | Railway station information |
| `trains.json` | Train details, routes and schedules |

### Browser Storage

- **LocalStorage:** Stores browser-side changes such as registered accounts, bookings, cancellation status, updated profiles and registered trains.
- **SessionStorage:** Maintains the active login session and temporary booking information where required.

JSON files provide initial data. Changes made through the browser are stored in LocalStorage and do not directly modify the original JSON files.

## 8. Design System

RailDesk uses a premium railway-inspired visual design.

The design system includes:

- Navy and royal blue colour combinations.
- Elegant brass/gold accents.
- Modern typography.
- Reusable buttons and form elements.
- Customer and Admin navigation layouts.
- Premium ticket cards.
- Interactive seat-selection layouts.
- Confirmation modals.
- Toast notifications.
- Responsive page layouts.
- Smooth animations and transitions.

`pages/design-system.html` is a development-only component preview. It is not part of the Customer or Admin portal navigation.

## 9. Limitations and Security

This project is a frontend demonstration.

- Authentication is implemented for demonstration purposes.
- Passwords stored in LocalStorage are not secure for production.
- LocalStorage data belongs to the browser in which the application is running.
- Data is not automatically synchronized between different users or devices.
- JSON files act as initial datasets and are not directly modified by frontend JavaScript.
- Payment functionality is a demonstration and does not process real transactions.
- No real railway reservation or ticket issuance takes place.
- Production deployment would require a secure backend, database, authentication and payment integration.

Aadhaar is required during registration. The original project documentation does not specify additional length or digit validation.

## 10. Development Guidelines

- Use only HTML5, CSS3 and Vanilla JavaScript.
- Keep files modular and properly organized.
- Use descriptive filenames.
- Add meaningful comments to important functions.
- Reuse shared UI components.
- Preserve existing functionality when improving the UI.
- Maintain consistency across Customer and Admin portals.
- Test major workflows before project submission.

---

**Project:** RailDesk — Train Ticket Booking System

**Development:** HTML, CSS and Vanilla JavaScript

**Execution:** VS Code Live Server or Python HTTP Server