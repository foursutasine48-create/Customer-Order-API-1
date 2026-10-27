import express from "express";
import { randomBytes } from "crypto";
import { conn } from "../dbconnect";
import {
  calculateRoute,
  DeliveryOrderRecord,
  DeliveryPlanError,
  DISTANCE_METHOD,
  formatSqlTime,
  inTransaction,
  parseRequestedPlan,
  RequestedPlan,
  RiderRecord,
  validatePlanRecords,
} from "../model/delivery-plan";
import { SHOP_CENTER } from "../model/customer";
import { DEFAULT_ORDER_STATUS } from "../model/order";

export const router = express.Router();

interface LoadedPlanData {
  riders: RiderRecord[];
  orders: DeliveryOrderRecord[];
  assignedOrderIds: number[];
  planDate: string;
}

async function loadPlanData(
  connection: Awaited<ReturnType<typeof conn.getConnection>>,
  request: RequestedPlan,
  lockRows: boolean
): Promise<LoadedPlanData> {
  const riderIds = request.routes.map((route) => route.rider_id).sort((a, b) => a - b);
  const orderIds = request.routes.flatMap((route) => route.order_ids).sort((a, b) => a - b);
  const lock = lockRows ? " FOR UPDATE" : "";
  const [riders]: any = await connection.query(
    `SELECT rider_id, rider_name, status
       FROM Rider
      WHERE rider_id IN (?)
      ORDER BY rider_id${lock}`,
    [riderIds]
  );
  const [orders]: any = await connection.query(
    `SELECT o.order_id, o.customer_id, o.box_quantity, o.status,
            c.customer_id AS matched_customer_id, c.first_name, c.last_name,
            c.phone, c.address, c.latitude, c.longitude
       FROM \`Order\` o
       LEFT JOIN Customer c ON c.customer_id = o.customer_id
      WHERE o.order_id IN (?)
      ORDER BY o.order_id${lock}`,
    [orderIds]
  );
  const [assignedRows]: any = await connection.query(
    `SELECT order_id
       FROM Route_Stop
      WHERE order_id IN (?)
      ORDER BY order_id${lock}`,
    [orderIds]
  );
  const [dateRows]: any = await connection.query(
    "SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS plan_date"
  );
  const planDate = dateRows[0]?.plan_date;
  if (typeof planDate !== "string")
    throw new Error("Database did not return the current delivery date.");

  validatePlanRecords(
    request,
    riders as RiderRecord[],
    orders as DeliveryOrderRecord[],
    assignedRows.map((row: { order_id: number }) => Number(row.order_id))
  );

  return {
    riders: riders as RiderRecord[],
    orders: orders as DeliveryOrderRecord[],
    assignedOrderIds: assignedRows.map((row: { order_id: number }) => Number(row.order_id)),
    planDate,
  };
}

function calculateRoutes(
  request: RequestedPlan,
  data: LoadedPlanData,
  optimizeOrder: boolean
) {
  const riderById = new Map(data.riders.map((rider) => [Number(rider.rider_id), rider]));
  return request.routes.map((route, index) =>
    calculateRoute(
      riderById.get(route.rider_id)!,
      data.orders,
      route.order_ids,
      index,
      data.planDate,
      optimizeOrder
    )
  );
}

function summarizeRoutes(routes: ReturnType<typeof calculateRoutes>) {
  const totalDistance = routes.reduce((sum, route) => sum + route.total_distance_km, 0);
  const totalTime = routes.reduce((maximum, route) => Math.max(maximum, route.total_time_minutes), 0);
  const totalBoxes = routes.reduce((sum, route) => sum + route.total_boxes, 0);
  const deliveryCost = routes.reduce((sum, route) => sum + route.delivery_cost, 0);
  const foodCost = routes.reduce((sum, route) => sum + route.food_cost, 0);
  const revenue = routes.reduce((sum, route) => sum + route.revenue, 0);
  return {
    total_distance_km: Number(totalDistance.toFixed(2)),
    total_time_minutes: totalTime,
    total_boxes: totalBoxes,
    delivery_cost: Number(deliveryCost.toFixed(2)),
    food_cost: foodCost,
    revenue,
    profit: Number((revenue - foodCost - deliveryCost).toFixed(2)),
    on_time: routes.every((route) => route.on_time),
  };
}

function handleError(res: express.Response, error: unknown, operation: string): void {
  if (error instanceof DeliveryPlanError) {
    res.status(error.statusCode).json({
      code: error.code,
      message: error.message,
    });
    return;
  }
  console.error(`${operation}:`, error);
  res.status(500).json({ code: "DELIVERY_PLAN_FAILED", message: "ไม่สามารถประมวลผลแผนจัดส่งได้" });
}

// POST /delivery-plan/preview
router.post("/preview", async (req, res) => {
  let connection: Awaited<ReturnType<typeof conn.getConnection>> | undefined;
  try {
    const request = parseRequestedPlan(req.body);
    connection = await conn.getConnection();
    const result = await inTransaction(connection, async () => {
      const data = await loadPlanData(connection!, request, false);
      const routes = calculateRoutes(request, data, true);
      return {
        start_point: routes[0]!.start_point,
        start_time: routes[0]!.start_time,
        distance_method: DISTANCE_METHOD,
        ...summarizeRoutes(routes),
        routes,
      };
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, "Failed to preview delivery plan");
  } finally {
    connection?.release();
  }
});

// POST /delivery-plan/confirm
router.post("/confirm", async (req, res) => {
  let connection: Awaited<ReturnType<typeof conn.getConnection>> | undefined;
  try {
    const request = parseRequestedPlan(req.body);
    connection = await conn.getConnection();
    const result = await inTransaction(connection, async () => {
      const data = await loadPlanData(connection!, request, true);
      const routes = calculateRoutes(request, data, false);
      const summary = summarizeRoutes(routes);
      const endTime = formatSqlTime(summary.total_time_minutes);
      const [planResult]: any = await connection!.query(
        `INSERT INTO Delivery_Plan
          (delivery_date, start_time, end_time, total_distance, total_time,
           total_cost, total_profit, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.planDate,
          routes[0]!.start_time,
          endTime,
          summary.total_distance_km,
          summary.total_time_minutes,
          Number((summary.food_cost + summary.delivery_cost).toFixed(2)),
          summary.profit,
          "ยืนยันแล้ว",
        ]
      );
      const planId = Number(planResult.insertId);
      const savedRoutes = [];

      for (const route of routes) {
        const workNo = `JOB-${data.planDate.replace(/-/g, "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
        const [routeResult]: any = await connection!.query(
          `INSERT INTO Rider_Route
            (plan_id, rider_id, work_no, route_color, total_distance, total_time, delivery_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            planId,
            route.rider_id,
            workNo,
            route.route_color,
            route.total_distance_km,
            route.total_time_minutes,
            route.delivery_cost,
          ]
        );
        const routeId = Number(routeResult.insertId);
        const stops = route.orders.map((order) => [
          routeId,
          order.order_id,
          order.stop_sequence,
          order.segment_distance_km,
          order.estimated_time,
          order.delivery_status,
        ]);
        await connection!.query(
          `INSERT INTO Route_Stop
            (route_id, order_id, stop_sequence, distance, estimated_time, delivery_status)
           VALUES ?`,
          [stops]
        );
        const [riderUpdate]: any = await connection!.query(
          "UPDATE Rider SET status = ? WHERE rider_id = ? AND status IN (?, ?)",
          ["กำลังส่ง", route.rider_id, "ว่าง", "พร้อมรับงาน"]
        );
        if (riderUpdate.affectedRows !== 1)
          throw new DeliveryPlanError(`สถานะไรเดอร์รหัส ${route.rider_id} เปลี่ยนระหว่างยืนยันแผน`, 409, "RIDER_STATUS_CHANGED");

        const routeOrderIds = route.orders.map((order) => order.order_id);
        const [orderUpdate]: any = await connection!.query(
          "UPDATE `Order` SET status = ? WHERE order_id IN (?) AND status = ?",
          ["กำลังจัดส่ง", routeOrderIds, DEFAULT_ORDER_STATUS]
        );
        if (orderUpdate.affectedRows !== routeOrderIds.length)
          throw new DeliveryPlanError("สถานะออเดอร์เปลี่ยนระหว่างยืนยันแผน กรุณาคำนวณใหม่", 409, "ORDER_STATUS_CHANGED");

        savedRoutes.push({
          plan_id: planId,
          route_id: routeId,
          rider_id: route.rider_id,
          rider_name: route.rider_name,
          work_no: workNo,
          route_color: route.route_color,
          start_point: route.start_point,
          start_time: route.start_time,
          distance_method: route.distance_method,
          total_distance_km: route.total_distance_km,
          total_time_minutes: route.total_time_minutes,
          total_boxes: route.total_boxes,
          delivery_cost: route.delivery_cost,
          food_cost: route.food_cost,
          revenue: route.revenue,
          profit: route.profit,
          on_time: route.on_time,
          orders: route.orders,
        });
      }

      return {
        plan_id: planId,
        start_point: routes[0]!.start_point,
        start_time: routes[0]!.start_time,
        distance_method: DISTANCE_METHOD,
        ...summary,
        routes: savedRoutes,
      };
    });
    res.status(201).json(result);
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      res.status(409).json({
        code: "ORDER_ALREADY_ASSIGNED",
        message: "มีออเดอร์ถูกมอบหมายแล้ว กรุณาคำนวณแผนใหม่",
      });
      return;
    }
    handleError(res, error, "Failed to confirm delivery plan");
  } finally {
    connection?.release();
  }
});

// GET /delivery-plan/:planId
router.get("/:planId", async (req, res) => {
  const planId = Number(req.params.planId);
  if (!Number.isInteger(planId) || planId < 1)
    return res.status(400).json({ code: "INVALID_PLAN_ID", message: "planId ต้องเป็นจำนวนเต็มบวก" });

  try {
    const [plans]: any = await conn.query(
      `SELECT plan_id, delivery_date, start_time, end_time, total_distance,
              total_time, total_cost, total_profit, status
         FROM Delivery_Plan
        WHERE plan_id = ?`,
      [planId]
    );
    if (!plans.length)
      return res.status(404).json({ code: "PLAN_NOT_FOUND", message: "ไม่พบแผนจัดส่ง" });

    const [rows]: any = await conn.query(
      `SELECT rr.route_id, rr.rider_id, r.rider_name, rr.work_no, rr.route_color,
              rr.total_distance, rr.total_time, rr.delivery_cost,
              rs.stop_sequence, rs.distance AS segment_distance,
              rs.estimated_time, rs.delivery_status,
              o.order_id, o.box_quantity,
              c.customer_id, c.first_name, c.last_name, c.phone, c.address,
              c.latitude, c.longitude
         FROM Rider_Route rr
         JOIN Rider r ON r.rider_id = rr.rider_id
         LEFT JOIN Route_Stop rs ON rs.route_id = rr.route_id
         LEFT JOIN \`Order\` o ON o.order_id = rs.order_id
         LEFT JOIN Customer c ON c.customer_id = o.customer_id
        WHERE rr.plan_id = ?
        ORDER BY rr.route_id, rs.stop_sequence`,
      [planId]
    );

    const routesById = new Map<number, any>();
    for (const row of rows) {
      const routeId = Number(row.route_id);
      let route = routesById.get(routeId);
      if (!route) {
        route = {
          route_id: routeId,
          rider_id: Number(row.rider_id),
          rider_name: row.rider_name,
          work_no: row.work_no,
          route_color: row.route_color,
          total_distance_km: Number(row.total_distance),
          total_time_minutes: Number(row.total_time),
          delivery_cost: Number(row.delivery_cost),
          total_boxes: 0,
          orders: [],
        };
        routesById.set(routeId, route);
      }
      if (row.order_id === null) continue;
      route.total_boxes += Number(row.box_quantity);
      route.orders.push({
        order_id: Number(row.order_id),
        customer_id: Number(row.customer_id),
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        address: row.address,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        box_quantity: Number(row.box_quantity),
        stop_sequence: Number(row.stop_sequence),
        segment_distance_km: Number(row.segment_distance),
        estimated_time: row.estimated_time,
        delivery_status: row.delivery_status,
      });
    }

    res.json({
      ...plans[0],
      plan_id: Number(plans[0].plan_id),
      total_distance_km: Number(plans[0].total_distance),
      total_time_minutes: Number(plans[0].total_time),
      distance_method: DISTANCE_METHOD,
      start_point: SHOP_CENTER,
      routes: [...routesById.values()],
    });
  } catch (error) {
    handleError(res, error, "Failed to fetch delivery plan");
  }
});
