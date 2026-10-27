# ProjectWeb

Angular application for customer and order management. The frontend calls the customer/order API at `https://customer-order-api-5.onrender.com`; update `API_URL` in `src/app/services/api.ts` when using a different backend.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Features

- Create, list, update, delete, and search customers by partial first or last name.
- Show each customer's and order's distance from the coordinates entered on the page (defaults to latitude 16.245, longitude 103.25).
- Find customers and orders within a configurable radius of entered latitude/longitude coordinates (defaults to 1 km and 2 km).
- Create and manage orders, including updating box quantities and deleting individual orders.
- Generate 20–30 sample orders through the backend or clear all orders.

The backend must provide the endpoints used by `ApiService`, including `/customer`, `/customer/search`, `/customer/nearby`, `/order`, `/order/simulate`, `/order/clear`, and `/order/nearby`.

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
