# ProjectWeb

Angular application for customer and order management. The frontend calls the customer/order API at `https://customer-order-api-5.onrender.com`; update `API_URL` in `src/app/services/api.ts` when using a different backend.

## Production server

Build the production files and serve them with Node:

```bash
npm run build
npm start
```

Open `http://localhost:4200/`. The server uses port `4200` locally or the `PORT` environment variable when deployed. Client-side URLs such as `/riders` are served by Angular's `index.html`.

`npm start` runs `server.cjs` and does not start Angular's watch server. Use `ng serve` separately when you need development mode and live reload.

## Features

- Create, list, update, delete, and search customers by partial first or last name.
- Show each customer's and order's distance from the coordinates entered on the page (defaults to latitude 16.245, longitude 103.25).
- Find customers and orders within a configurable radius of entered latitude/longitude coordinates (defaults to 1 km and 2 km).
- Create and manage orders, including updating box quantities and deleting individual orders.
- Generate 20–30 sample orders through the backend or clear all orders.
- Manage riders, assign up to three orders per route, and look up a delivery job by rider ID and work number.
- Plan a delivery route by nearest stop, adjust the stop order, and view the saved route on a Leaflet map or in Google Maps.

`ApiService` always uses the configured Render API URL, including when the frontend runs locally. The backend must provide the endpoints used by `ApiService`, including `/customer`, `/customer/search`, `/customer/nearby`, `/order`, `/order/simulate`, `/order/clear`, `/order/nearby`, `/rider`, `/rider/:id/status`, `/rider/:id/assignments`, and `/rider/job-lookup`.

The frontend always uses the configured Render API URL, including when opened locally, so the local backend does not need to be running. The Rider screens use the API implemented in the backend project's `controller/rider.ts`. Rider job lookup currently uses rider ID and work number; the backend does not provide authentication.

The route planner can save one route for one rider at a time, with up to three orders, using the existing rider assignment API. Route ordering is estimated by straight-line distance from the shop and can be adjusted before saving. The backend currently has no API to list, edit, or recalculate saved routes; saved plans update order and rider statuses immediately. The map draws straight lines between stops; Google Maps provides road navigation.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
