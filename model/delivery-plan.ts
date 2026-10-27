import { PoolConnection } from "mysql2/promise";
import { SHOP_CENTER } from "./customer";
import { DEFAULT_ORDER_STATUS } from "./order";
import { isAvailableRider, MAX_ORDERS_PER_RIDER } from "./rider";

export const DELIVERY_START_TIME = "11:30:00";
export const AVERAGE_SPEED_KMH = 30;
export const RIDER_ROUND_COST = 15;
export const COST_PER_KM_PER_BOX = 2;
export const FOOD_COST_PER_BOX = 40;
export const SALE_PRICE_PER_BOX = 65;
export const DISTANCE_METHOD = "straight_line_haversine";

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

export interface RequestedRoute {
  rider_id: number;
  order_ids: number[];
}

export interface RequestedPlan {
  routes: RequestedRoute[];
}

export interface RiderRecord {
  rider_id: number;
  rider_name: string;
  status: string;
}

export interface DeliveryOrderRecord {
  order_id: number;
  customer_id: number;
  box_quantity: number;
  status: string;
  matched_customer_id: number | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

export interface PlannedStop {
  order_id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  box_quantity: number;
  stop_sequence: number;
  segment_distance_km: number;
  estimated_time: string;
  delivery_status: string;
}

export interface CalculatedRoute {
  rider_id: number;
  rider_name: string;
  route_color: string;
  start_point: { lat: number; lng: number };
  start_time: string;
  distance_method: typeof DISTANCE_METHOD;
  total_distance_km: number;
  total_time_minutes: number;
  total_boxes: number;
  delivery_cost: number;
  food_cost: number;
  revenue: number;
  profit: number;
  on_time: boolean;
  orders: PlannedStop[];
}

export class DeliveryPlanError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = "DeliveryPlanError";
  }
}

export function parseRequestedPlan(value: unknown): RequestedPlan {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DeliveryPlanError("body ต้องเป็น object", 400, "INVALID_BODY");

  const routes = (value as Record<string, unknown>).routes;
  if (!Array.isArray(routes) || routes.length === 0)
    throw new DeliveryPlanError("routes ต้องมีอย่างน้อย 1 เส้นทาง", 400, "INVALID_ROUTES");

  const riderIds = new Set<number>();
  const orderIds = new Set<number>();
  const parsedRoutes: RequestedRoute[] = [];

  for (const [index, rawRoute] of routes.entries()) {
    if (!rawRoute || typeof rawRoute !== "object" || Array.isArray(rawRoute))
      throw new DeliveryPlanError(`routes[${index}] ต้องเป็น object`, 400, "INVALID_ROUTE");

    const route = rawRoute as Record<string, unknown>;
    const riderId = route.rider_id;
    const orderIdsForRoute = route.order_ids;
    if (!isPositiveInteger(riderId))
      throw new DeliveryPlanError(`routes[${index}].rider_id ต้องเป็นจำนวนเต็มบวก`, 400, "INVALID_RIDER_ID");
    if (riderIds.has(riderId))
      throw new DeliveryPlanError(`เลือกไรเดอร์รหัส ${riderId} ซ้ำ`, 400, "DUPLICATE_RIDER");
    riderIds.add(riderId);

    if (
      !Array.isArray(orderIdsForRoute)
      || orderIdsForRoute.length < 1
      || orderIdsForRoute.length > MAX_ORDERS_PER_RIDER
      || !orderIdsForRoute.every(isPositiveInteger)
    ) {
      throw new DeliveryPlanError(
        `routes[${index}].order_ids ต้องมีรหัสออเดอร์ 1-${MAX_ORDERS_PER_RIDER} รายการ`,
        400,
        "INVALID_ORDER_COUNT"
      );
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

export function validatePlanRecords(
  request: RequestedPlan,
  riders: RiderRecord[],
  orders: DeliveryOrderRecord[],
  assignedOrderIds: number[]
): void {
  const riderById = new Map(riders.map((rider) => [Number(rider.rider_id), rider]));
  for (const route of request.routes) {
    const rider = riderById.get(route.rider_id);
    if (!rider)
      throw new DeliveryPlanError(`ไม่พบไรเดอร์รหัส ${route.rider_id}`, 404, "RIDER_NOT_FOUND");
    if (!isAvailableRider(rider.status))
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
    const order = orderById.get(orderId)!;
    if (order.status !== DEFAULT_ORDER_STATUS)
      throw new DeliveryPlanError(
        `ออเดอร์รหัส ${orderId} ไม่อยู่ในสถานะ "${DEFAULT_ORDER_STATUS}"`,
        409,
        "ORDER_NOT_PENDING"
      );
    if (
      order.matched_customer_id === null
      || order.latitude === null
      || order.longitude === null
      || !Number.isFinite(Number(order.latitude))
      || !Number.isFinite(Number(order.longitude))
      || Number(order.latitude) < -90
      || Number(order.latitude) > 90
      || Number(order.longitude) < -180
      || Number(order.longitude) > 180
    ) {
      throw new DeliveryPlanError(`ออเดอร์รหัส ${orderId} ไม่มีลูกค้าหรือพิกัดที่ถูกต้อง`, 409, "ORDER_MISSING_COORDINATES");
    }
  }
}

export function calculateRoute(
  rider: RiderRecord,
  orderRecords: DeliveryOrderRecord[],
  requestedOrderIds: number[],
  routeIndex: number,
  planDate: string,
  optimizeOrder: boolean
): CalculatedRoute {
  const orderById = new Map(orderRecords.map((order) => [Number(order.order_id), order]));
  const remaining = requestedOrderIds.map((orderId) => orderById.get(orderId)!);
  const orderedOrders = optimizeOrder
    ? nearestNeighborOrder(remaining)
    : remaining;

  let previous = { latitude: SHOP_CENTER.lat, longitude: SHOP_CENTER.lng };
  let cumulativeDistance = 0;
  let totalBoxes = 0;
  let deliveryCost = RIDER_ROUND_COST;

  const orders = orderedOrders.map((order, index): PlannedStop => {
    const latitude = Number(order.latitude);
    const longitude = Number(order.longitude);
    const legDistance = round2(distanceKm(previous, { latitude, longitude }));
    cumulativeDistance = round2(cumulativeDistance + legDistance);
    totalBoxes += Number(order.box_quantity);
    deliveryCost += legDistance * Number(order.box_quantity) * COST_PER_KM_PER_BOX;
    previous = { latitude, longitude };

    const elapsedMinutes = Math.ceil(cumulativeDistance * 60 / AVERAGE_SPEED_KMH);
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
  const totalTime = Math.ceil(totalDistance * 60 / AVERAGE_SPEED_KMH);
  const foodCost = totalBoxes * FOOD_COST_PER_BOX;
  const revenue = totalBoxes * SALE_PRICE_PER_BOX;
  const roundedDeliveryCost = round2(deliveryCost);

  return {
    rider_id: Number(rider.rider_id),
    rider_name: rider.rider_name,
    route_color: routeColor(routeIndex),
    start_point: SHOP_CENTER,
    start_time: DELIVERY_START_TIME,
    distance_method: DISTANCE_METHOD,
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

export function routeColor(index: number): string {
  if (index < PALETTE.length) return PALETTE[index]!;
  const hue = ((index - PALETTE.length) * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 45%)`;
}

export function formatDateTime(date: string, elapsedMinutes: number): string {
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const startMinutes = 11 * 60 + 30 + elapsedMinutes;
  const timestamp = Date.UTC(year, month - 1, day) + startMinutes * 60_000;
  return new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
}

export function formatSqlTime(elapsedMinutes: number): string {
  const totalSeconds = (11 * 60 + 30 + elapsedMinutes) * 60;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function inTransaction<T>(
  connection: Pick<PoolConnection, "beginTransaction" | "commit" | "rollback">,
  work: () => Promise<T>
): Promise<T> {
  await connection.beginTransaction();
  try {
    const result = await work();
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Transaction failed and rollback also failed");
    }
    throw error;
  }
}

function nearestNeighborOrder(orders: DeliveryOrderRecord[]): DeliveryOrderRecord[] {
  const remaining = [...orders];
  const result: DeliveryOrderRecord[] = [];
  let point = { latitude: SHOP_CENTER.lat, longitude: SHOP_CENTER.lng };

  while (remaining.length) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const order = remaining[index]!;
      const distance = distanceKm(point, {
        latitude: Number(order.latitude),
        longitude: Number(order.longitude),
      });
      if (
        distance < nearestDistance
        || (distance === nearestDistance && Number(order.order_id) < Number(remaining[nearestIndex]!.order_id))
      ) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    const [next] = remaining.splice(nearestIndex, 1);
    if (!next) break;
    result.push(next);
    point = { latitude: Number(next.latitude), longitude: Number(next.longitude) };
  }
  return result;
}

function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitude1 = radians(from.latitude);
  const latitude2 = radians(to.latitude);
  const deltaLatitude = latitude2 - latitude1;
  const deltaLongitude = radians(to.longitude - from.longitude);
  const haversine = Math.min(1, Math.max(0,
    Math.sin(deltaLatitude / 2) ** 2
      + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2
  ));
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
