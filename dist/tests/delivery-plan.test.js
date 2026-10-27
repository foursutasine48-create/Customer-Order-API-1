"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const delivery_plan_1 = require("../model/delivery-plan");
const riders = [
    { rider_id: 1, rider_name: "Rider One", status: "พร้อมรับงาน" },
    { rider_id: 2, rider_name: "Rider Two", status: "ว่าง" },
];
const orders = [
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
function expectPlanError(action, code) {
    strict_1.default.throws(action, (error) => error instanceof delivery_plan_1.DeliveryPlanError && error.code === code);
}
(0, node_test_1.default)("parses a multi-rider plan and rejects duplicate rider/order ids", () => {
    const parsed = (0, delivery_plan_1.parseRequestedPlan)({
        routes: [
            { rider_id: 1, order_ids: [12, 14] },
            { rider_id: 2, order_ids: [18] },
        ],
    });
    strict_1.default.equal(parsed.routes.length, 2);
    strict_1.default.doesNotThrow(() => (0, delivery_plan_1.validatePlanRecords)(parsed, riders, orders, []));
    expectPlanError(() => (0, delivery_plan_1.parseRequestedPlan)({
        routes: [
            { rider_id: 1, order_ids: [12] },
            { rider_id: 2, order_ids: [12] },
        ],
    }), "DUPLICATE_ORDER");
    expectPlanError(() => (0, delivery_plan_1.parseRequestedPlan)({
        routes: [
            { rider_id: 1, order_ids: [12] },
            { rider_id: 1, order_ids: [14] },
        ],
    }), "DUPLICATE_RIDER");
});
(0, node_test_1.default)("rejects more than three orders per rider", () => {
    expectPlanError(() => (0, delivery_plan_1.parseRequestedPlan)({
        routes: [{ rider_id: 1, order_ids: [1, 2, 3, 4] }],
    }), "INVALID_ORDER_COUNT");
});
(0, node_test_1.default)("calculates a straight-line preview route and returns ordered stops", () => {
    const route = (0, delivery_plan_1.calculateRoute)(riders[0], orders, [14, 12], 0, "2026-10-27", true);
    strict_1.default.equal(route.distance_method, "straight_line_haversine");
    strict_1.default.deepEqual(route.orders.map((order) => order.order_id), [12, 14]);
    strict_1.default.equal(route.total_boxes, 3);
    strict_1.default.equal(route.orders[0].stop_sequence, 1);
    strict_1.default.match(route.orders[0].estimated_time, /^2026-10-27 11:/);
});
(0, node_test_1.default)("rejects riders who are not available", () => {
    expectPlanError(() => (0, delivery_plan_1.validatePlanRecords)({ routes: [{ rider_id: 1, order_ids: [12] }] }, [{ ...riders[0], status: "กำลังส่ง" }], orders, []), "RIDER_NOT_AVAILABLE");
});
(0, node_test_1.default)("rejects an order with missing coordinates", () => {
    expectPlanError(() => (0, delivery_plan_1.validatePlanRecords)({ routes: [{ rider_id: 1, order_ids: [12] }] }, riders, [{ ...orders[0], latitude: null }], []), "ORDER_MISSING_COORDINATES");
});
(0, node_test_1.default)("rejects an order that is already assigned", () => {
    expectPlanError(() => (0, delivery_plan_1.validatePlanRecords)({ routes: [{ rider_id: 1, order_ids: [12] }] }, riders, orders, [12]), "ORDER_ALREADY_ASSIGNED");
});
(0, node_test_1.default)("rolls back a transaction when persistence work fails", async () => {
    const calls = [];
    const connection = {
        beginTransaction: async () => { calls.push("begin"); },
        commit: async () => { calls.push("commit"); },
        rollback: async () => { calls.push("rollback"); },
    };
    await strict_1.default.rejects((0, delivery_plan_1.inTransaction)(connection, async () => {
        calls.push("write");
        throw new Error("simulated insert failure");
    }), /simulated insert failure/);
    strict_1.default.deepEqual(calls, ["begin", "write", "rollback"]);
});
//# sourceMappingURL=delivery-plan.test.js.map