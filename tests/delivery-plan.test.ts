import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRoute,
  DeliveryOrderRecord,
  DeliveryPlanError,
  inTransaction,
  parseRequestedPlan,
  RiderRecord,
  validatePlanRecords,
} from "../model/delivery-plan";

const riders: RiderRecord[] = [
  { rider_id: 1, rider_name: "Rider One", status: "พร้อมรับงาน" },
  { rider_id: 2, rider_name: "Rider Two", status: "ว่าง" },
];

const orders: DeliveryOrderRecord[] = [
  {
    order_id: 12,
    customer_id: 101,
    box_quantity: 2,
    status: "รอจัดส่ง",
    matched_customer_id: 101,
    first_name: "Customer",
    last_name: "Near",
    phone: "0812345678",
    address: "Near address",
    latitude: 16.2468,
    longitude: 103.2556,
  },
  {
    order_id: 14,
    customer_id: 102,
    box_quantity: 1,
    status: "รอจัดส่ง",
    matched_customer_id: 102,
    first_name: "Customer",
    last_name: "Far",
    phone: "0812345679",
    address: "Far address",
    latitude: 16.25,
    longitude: 103.26,
  },
  {
    order_id: 18,
    customer_id: 103,
    box_quantity: 3,
    status: "รอจัดส่ง",
    matched_customer_id: 103,
    first_name: "Customer",
    last_name: "Other",
    phone: "0812345680",
    address: "Other address",
    latitude: 16.24,
    longitude: 103.25,
  },
];

function expectPlanError(action: () => unknown, code: string): void {
  assert.throws(action, (error: unknown) =>
    error instanceof DeliveryPlanError && error.code === code
  );
}

test("parses a multi-rider plan and rejects duplicate rider/order ids", () => {
  const parsed = parseRequestedPlan({
    routes: [
      { rider_id: 1, order_ids: [12, 14] },
      { rider_id: 2, order_ids: [18] },
    ],
  });
  assert.equal(parsed.routes.length, 2);
  assert.doesNotThrow(() => validatePlanRecords(parsed, riders, orders, []));

  expectPlanError(() => parseRequestedPlan({
    routes: [
      { rider_id: 1, order_ids: [12] },
      { rider_id: 2, order_ids: [12] },
    ],
  }), "DUPLICATE_ORDER");

  expectPlanError(() => parseRequestedPlan({
    routes: [
      { rider_id: 1, order_ids: [12] },
      { rider_id: 1, order_ids: [14] },
    ],
  }), "DUPLICATE_RIDER");
});

test("rejects more than three orders per rider", () => {
  expectPlanError(() => parseRequestedPlan({
    routes: [{ rider_id: 1, order_ids: [1, 2, 3, 4] }],
  }), "INVALID_ORDER_COUNT");
});

test("calculates a straight-line preview route and returns ordered stops", () => {
  const route = calculateRoute(riders[0]!, orders, [14, 12], 0, "2026-10-27", true);
  assert.equal(route.distance_method, "straight_line_haversine");
  assert.deepEqual(route.orders.map((order) => order.order_id), [12, 14]);
  assert.equal(route.total_boxes, 3);
  assert.equal(route.orders[0]!.stop_sequence, 1);
  assert.match(route.orders[0]!.estimated_time, /^2026-10-27 11:/);
});

test("rejects riders who are not available", () => {
  expectPlanError(() => validatePlanRecords(
    { routes: [{ rider_id: 1, order_ids: [12] }] },
    [{ ...riders[0]!, status: "กำลังส่ง" }],
    orders,
    []
  ), "RIDER_NOT_AVAILABLE");
});

test("rejects an order with missing coordinates", () => {
  expectPlanError(() => validatePlanRecords(
    { routes: [{ rider_id: 1, order_ids: [12] }] },
    riders,
    [{ ...orders[0]!, latitude: null }],
    []
  ), "ORDER_MISSING_COORDINATES");
});

test("rejects an order that is already assigned", () => {
  expectPlanError(() => validatePlanRecords(
    { routes: [{ rider_id: 1, order_ids: [12] }] },
    riders,
    orders,
    [12]
  ), "ORDER_ALREADY_ASSIGNED");
});

test("rolls back a transaction when persistence work fails", async () => {
  const calls: string[] = [];
  const connection = {
    beginTransaction: async () => { calls.push("begin"); },
    commit: async () => { calls.push("commit"); },
    rollback: async () => { calls.push("rollback"); },
  };

  await assert.rejects(
    inTransaction(connection, async () => {
      calls.push("write");
      throw new Error("simulated insert failure");
    }),
    /simulated insert failure/
  );
  assert.deepEqual(calls, ["begin", "write", "rollback"]);
});
