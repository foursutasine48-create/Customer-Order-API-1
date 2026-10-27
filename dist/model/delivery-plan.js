"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryPlanError = exports.DISTANCE_METHOD = exports.SALE_PRICE_PER_BOX = exports.FOOD_COST_PER_BOX = exports.COST_PER_KM_PER_BOX = exports.RIDER_ROUND_COST = exports.AVERAGE_SPEED_KMH = exports.DELIVERY_START_TIME = void 0;
exports.parseRequestedPlan = parseRequestedPlan;
exports.validatePlanRecords = validatePlanRecords;
exports.calculateRoute = calculateRoute;
exports.routeColor = routeColor;
exports.formatDateTime = formatDateTime;
exports.formatSqlTime = formatSqlTime;
exports.inTransaction = inTransaction;
const customer_1 = require("./customer");
const order_1 = require("./order");
const rider_1 = require("./rider");
exports.DELIVERY_START_TIME = "11:30:00";
exports.AVERAGE_SPEED_KMH = 30;
exports.RIDER_ROUND_COST = 15;
exports.COST_PER_KM_PER_BOX = 2;
exports.FOOD_COST_PER_BOX = 40;
exports.SALE_PRICE_PER_BOX = 65;
exports.DISTANCE_METHOD = "straight_line_haversine";
const PALETTE = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#9333ea",
    "#ea580c",
    "#0891b2",
    "#c026d3",
    "#4d7c0f",
    "#be123c",
    "#0369a1",
    "#a16207",
    "#475569",
];
class DeliveryPlanError extends Error {
    statusCode;
    code;
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "DeliveryPlanError";
    }
}
exports.DeliveryPlanError = DeliveryPlanError;
function parseRequestedPlan(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new DeliveryPlanError("body ต้องเป็น object", 400, "INVALID_BODY");
    const routes = value.routes;
    if (!Array.isArray(routes) || routes.length === 0)
        throw new DeliveryPlanError("routes ต้องมีอย่างน้อย 1 เส้นทาง", 400, "INVALID_ROUTES");
    const riderIds = new Set();
    const orderIds = new Set();
    const parsedRoutes = [];
    for (const [index, rawRoute] of routes.entries()) {
        if (!rawRoute || typeof rawRoute !== "object" || Array.isArray(rawRoute))
            throw new DeliveryPlanError(`routes[${index}] ต้องเป็น object`, 400, "INVALID_ROUTE");
        const route = rawRoute;
        const riderId = route.rider_id;
        const orderIdsForRoute = route.order_ids;
        if (!isPositiveInteger(riderId))
            throw new DeliveryPlanError(`routes[${index}].rider_id ต้องเป็นจำนวนเต็มบวก`, 400, "INVALID_RIDER_ID");
        if (riderIds.has(riderId))
            throw new DeliveryPlanError(`เลือกไรเดอร์รหัส ${riderId} ซ้ำ`, 400, "DUPLICATE_RIDER");
        riderIds.add(riderId);
        if (!Array.isArray(orderIdsForRoute)
            || orderIdsForRoute.length < 1
            || orderIdsForRoute.length > rider_1.MAX_ORDERS_PER_RIDER
            || !orderIdsForRoute.every(isPositiveInteger)) {
            throw new DeliveryPlanError(`routes[${index}].order_ids ต้องมีรหัสออเดอร์ 1-${rider_1.MAX_ORDERS_PER_RIDER} รายการ`, 400, "INVALID_ORDER_COUNT");
        }
        for (const orderId of orderIdsForRoute) {
            if (orderIds.has(orderId))
                throw new DeliveryPlanError(`ออเดอร์รหัส ${orderId} ถูกเลือกซ้ำในหลายเส้นทาง`, 400, "DUPLICATE_ORDER");
            orderIds.add(orderId);
        }
        parsedRoutes.push({
            rider_id: riderId,
            order_ids: [...orderIdsForRoute],
        });
    }
    return { routes: parsedRoutes };
}
function validatePlanRecords(request, riders, orders, assignedOrderIds) {
    const riderById = new Map(riders.map((rider) => [Number(rider.rider_id), rider]));
    for (const route of request.routes) {
        const rider = riderById.get(route.rider_id);
        if (!rider)
            throw new DeliveryPlanError(`ไม่พบไรเดอร์รหัส ${route.rider_id}`, 404, "RIDER_NOT_FOUND");
        if (!(0, rider_1.isAvailableRider)(rider.status))
            throw new DeliveryPlanError(`ไรเดอร์ ${rider.rider_name} ยังไม่พร้อมรับงาน`, 409, "RIDER_NOT_AVAILABLE");
    }
    const requestedOrderIds = request.routes.flatMap((route) => route.order_ids);
    const orderById = new Map(orders.map((order) => [Number(order.order_id), order]));
    const missingOrderId = requestedOrderIds.find((orderId) => !orderById.has(orderId));
    if (missingOrderId !== undefined)
        throw new DeliveryPlanError(`ไม่พบออเดอร์รหัส ${missingOrderId}`, 404, "ORDER_NOT_FOUND");
    const assigned = new Set(assignedOrderIds.map(Number));
    const assignedOrderId = requestedOrderIds.find((orderId) => assigned.has(orderId));
    if (assignedOrderId !== undefined)
        throw new DeliveryPlanError(`ออเดอร์รหัส ${assignedOrderId} ถูกมอบหมายแล้ว`, 409, "ORDER_ALREADY_ASSIGNED");
    for (const orderId of requestedOrderIds) {
        const order = orderById.get(orderId);
        if (order.status !== order_1.DEFAULT_ORDER_STATUS)
            throw new DeliveryPlanError(`ออเดอร์รหัส ${orderId} ไม่อยู่ในสถานะ "${order_1.DEFAULT_ORDER_STATUS}"`, 409, "ORDER_NOT_PENDING");
        if (order.matched_customer_id === null
            || order.latitude === null
            || order.longitude === null
            || !Number.isFinite(Number(order.latitude))
            || !Number.isFinite(Number(order.longitude))
            || Number(order.latitude) < -90
            || Number(order.latitude) > 90
            || Number(order.longitude) < -180
            || Number(order.longitude) > 180) {
            throw new DeliveryPlanError(`ออเดอร์รหัส ${orderId} ไม่มีลูกค้าหรือพิกัดที่ถูกต้อง`, 409, "ORDER_MISSING_COORDINATES");
        }
    }
}
function calculateRoute(rider, orderRecords, requestedOrderIds, routeIndex, planDate, optimizeOrder) {
    const orderById = new Map(orderRecords.map((order) => [Number(order.order_id), order]));
    const remaining = requestedOrderIds.map((orderId) => orderById.get(orderId));
    const orderedOrders = optimizeOrder
        ? nearestNeighborOrder(remaining)
        : remaining;
    let previous = { latitude: customer_1.SHOP_CENTER.lat, longitude: customer_1.SHOP_CENTER.lng };
    let cumulativeDistance = 0;
    let totalBoxes = 0;
    let deliveryCost = exports.RIDER_ROUND_COST;
    const orders = orderedOrders.map((order, index) => {
        const latitude = Number(order.latitude);
        const longitude = Number(order.longitude);
        const legDistance = round2(distanceKm(previous, { latitude, longitude }));
        cumulativeDistance = round2(cumulativeDistance + legDistance);
        totalBoxes += Number(order.box_quantity);
        deliveryCost += legDistance * Number(order.box_quantity) * exports.COST_PER_KM_PER_BOX;
        previous = { latitude, longitude };
        const elapsedMinutes = Math.ceil(cumulativeDistance * 60 / exports.AVERAGE_SPEED_KMH);
        return {
            order_id: Number(order.order_id),
            customer_id: Number(order.customer_id),
            first_name: order.first_name ?? "",
            last_name: order.last_name ?? "",
            phone: order.phone ?? "",
            address: order.address,
            latitude,
            longitude,
            box_quantity: Number(order.box_quantity),
            stop_sequence: index + 1,
            segment_distance_km: legDistance,
            estimated_time: formatDateTime(planDate, elapsedMinutes),
            delivery_status: "รอส่ง",
        };
    });
    const totalDistance = round2(cumulativeDistance);
    const totalTime = Math.ceil(totalDistance * 60 / exports.AVERAGE_SPEED_KMH);
    const foodCost = totalBoxes * exports.FOOD_COST_PER_BOX;
    const revenue = totalBoxes * exports.SALE_PRICE_PER_BOX;
    const roundedDeliveryCost = round2(deliveryCost);
    return {
        rider_id: Number(rider.rider_id),
        rider_name: rider.rider_name,
        route_color: routeColor(routeIndex),
        start_point: customer_1.SHOP_CENTER,
        start_time: exports.DELIVERY_START_TIME,
        distance_method: exports.DISTANCE_METHOD,
        total_distance_km: totalDistance,
        total_time_minutes: totalTime,
        total_boxes: totalBoxes,
        delivery_cost: roundedDeliveryCost,
        food_cost: foodCost,
        revenue,
        profit: round2(revenue - foodCost - roundedDeliveryCost),
        on_time: totalTime <= 60,
        orders,
    };
}
function routeColor(index) {
    if (index < PALETTE.length)
        return PALETTE[index];
    const hue = ((index - PALETTE.length) * 137.508) % 360;
    return `hsl(${hue.toFixed(1)}, 70%, 45%)`;
}
function formatDateTime(date, elapsedMinutes) {
    const [yearText, monthText, dayText] = date.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const startMinutes = 11 * 60 + 30 + elapsedMinutes;
    const timestamp = Date.UTC(year, month - 1, day) + startMinutes * 60_000;
    return new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
}
function formatSqlTime(elapsedMinutes) {
    const totalSeconds = (11 * 60 + 30 + elapsedMinutes) * 60;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
async function inTransaction(connection, work) {
    await connection.beginTransaction();
    try {
        const result = await work();
        await connection.commit();
        return result;
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "Transaction failed and rollback also failed");
        }
        throw error;
    }
}
function nearestNeighborOrder(orders) {
    const remaining = [...orders];
    const result = [];
    let point = { latitude: customer_1.SHOP_CENTER.lat, longitude: customer_1.SHOP_CENTER.lng };
    while (remaining.length) {
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < remaining.length; index += 1) {
            const order = remaining[index];
            const distance = distanceKm(point, {
                latitude: Number(order.latitude),
                longitude: Number(order.longitude),
            });
            if (distance < nearestDistance
                || (distance === nearestDistance && Number(order.order_id) < Number(remaining[nearestIndex].order_id))) {
                nearestDistance = distance;
                nearestIndex = index;
            }
        }
        const [next] = remaining.splice(nearestIndex, 1);
        if (!next)
            break;
        result.push(next);
        point = { latitude: Number(next.latitude), longitude: Number(next.longitude) };
    }
    return result;
}
function distanceKm(from, to) {
    const radians = (degrees) => degrees * Math.PI / 180;
    const latitude1 = radians(from.latitude);
    const latitude2 = radians(to.latitude);
    const deltaLatitude = latitude2 - latitude1;
    const deltaLongitude = radians(to.longitude - from.longitude);
    const haversine = Math.min(1, Math.max(0, Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2));
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function isPositiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}
//# sourceMappingURL=delivery-plan.js.map