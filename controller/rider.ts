import express from "express";
import { randomBytes } from "crypto";
import { conn } from "../dbconnect";
import {
  isAvailableRider,
  MAX_ORDERS_PER_RIDER,
  validateRider,
} from "../model/rider";
import {
  calculateRoute,
  DeliveryOrderRecord,
  DeliveryPlanError,
  RiderRecord,
  validatePlanRecords,
} from "../model/delivery-plan";

export const router = express.Router();

const START_TIME = "11:30:00";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// GET /rider
router.get("/", async (_req, res) => {
  try {
    const [rows] = await conn.query(
      "SELECT rider_id, rider_name, phone, status FROM Rider ORDER BY rider_id"
    );
    res.json(rows);
  } catch (error) {
    console.error("Failed to fetch riders:", error);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลไรเดอร์ได้" });
  }
});

// GET /rider/:id
router.get("/:id", async (req, res) => {
  try {
    const [rows]: any = await conn.query(
      "SELECT rider_id, rider_name, phone, status FROM Rider WHERE rider_id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "ไม่พบไรเดอร์" });
    res.json(rows[0]);
  } catch (error) {
    console.error("Failed to fetch rider:", error);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลไรเดอร์ได้" });
  }
});

// POST /rider
router.post("/", async (req, res) => {
  const errorMessage = validateRider(req.body);
  if (errorMessage) return res.status(400).json({ message: errorMessage });
  const { rider_name, phone, status = "ว่าง" } = req.body;
  try {
    const [result]: any = await conn.query(
      "INSERT INTO Rider (rider_name, phone, status) VALUES (?, ?, ?)",
      [rider_name.trim(), phone.trim(), status.trim()]
    );
    res.status(201).json({
      rider_id: result.insertId,
      rider_name: rider_name.trim(),
      phone: phone.trim(),
      status: status.trim(),
    });
  } catch (error) {
    console.error("Failed to create rider:", error);
    res.status(500).json({ message: "ไม่สามารถเพิ่มไรเดอร์ได้" });
  }
});

// PUT /rider/:id
router.put("/:id", async (req, res) => {
  const errorMessage = validateRider(req.body);
  if (errorMessage) return res.status(400).json({ message: errorMessage });
  if (req.body.status === undefined)
    return res.status(400).json({ message: "กรุณาระบุสถานะ (status) สำหรับการแก้ไข" });
  const { rider_name, phone, status } = req.body;
  try {
    const [result]: any = await conn.query(
      "UPDATE Rider SET rider_name = ?, phone = ?, status = ? WHERE rider_id = ?",
      [rider_name.trim(), phone.trim(), status.trim(), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "ไม่พบไรเดอร์" });
    res.json({
      rider_id: Number(req.params.id),
      rider_name: rider_name.trim(),
      phone: phone.trim(),
      status: status.trim(),
    });
  } catch (error) {
    console.error("Failed to update rider:", error);
    res.status(500).json({ message: "ไม่สามารถแก้ไขข้อมูลไรเดอร์ได้" });
  }
});

// PATCH /rider/:id/status
router.patch("/:id/status", async (req, res) => {
  const { status } = req.body ?? {};
  if (typeof status !== "string" || !status.trim())
    return res.status(400).json({ message: "กรุณาระบุสถานะ (status)" });
  try {
    const [result]: any = await conn.query(
      "UPDATE Rider SET status = ? WHERE rider_id = ?",
      [status.trim(), req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "ไม่พบไรเดอร์" });
    res.json({ rider_id: Number(req.params.id), status: status.trim() });
  } catch (error) {
    console.error("Failed to update rider status:", error);
    res.status(500).json({ message: "ไม่สามารถเปลี่ยนสถานะไรเดอร์ได้" });
  }
});

// DELETE /rider/:id
router.delete("/:id", async (req, res) => {
  try {
    const [result]: any = await conn.query(
      "DELETE FROM Rider WHERE rider_id = ?",
      [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "ไม่พบไรเดอร์" });
    res.json({ message: "ลบข้อมูลไรเดอร์เรียบร้อย" });
  } catch (error: any) {
    if (error.code === "ER_ROW_IS_REFERENCED_2")
      return res.status(409).json({ message: "ลบไรเดอร์ไม่ได้ เนื่องจากมีประวัติแผนส่งของ" });
    console.error("Failed to delete rider:", error);
    res.status(500).json({ message: "ไม่สามารถลบไรเดอร์ได้" });
  }
});

// POST /rider/:id/assignments  body: { order_ids: [1, 2, 3], work_no?: "JOB-001" }
router.post("/:id/assignments", async (req, res) => {
  const { order_ids } = req.body ?? {};
  if (
    !Array.isArray(order_ids)
    || order_ids.length < 1
    || order_ids.length > MAX_ORDERS_PER_RIDER
    || !order_ids.every(isPositiveInteger)
    || new Set(order_ids).size !== order_ids.length
  ) {
    return res.status(400).json({
      message: `order_ids ต้องเป็นรายการรหัสออเดอร์ที่ไม่ซ้ำกัน จำนวน 1-${MAX_ORDERS_PER_RIDER} รายการ`,
    });
  }

  const requestedWorkNo = req.body.work_no;
  if (requestedWorkNo !== undefined && (typeof requestedWorkNo !== "string" || !requestedWorkNo.trim()))
    return res.status(400).json({ message: "เลขใบงานไม่ถูกต้อง (work_no)" });

  const connection = await conn.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [riders]: any = await connection.query(
      "SELECT rider_id, rider_name, status FROM Rider WHERE rider_id = ? FOR UPDATE",
      [req.params.id]
    );
    if (!riders.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "ไม่พบไรเดอร์" });
    }
    if (!isAvailableRider(riders[0].status)) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: "ไรเดอร์ยังไม่พร้อมรับงาน" });
    }

    const [orders]: any = await connection.query(
      `SELECT o.order_id, o.customer_id, o.box_quantity, o.status,
              c.customer_id AS matched_customer_id, c.first_name, c.last_name,
              c.phone, c.address, c.latitude, c.longitude
         FROM \`Order\` o
         JOIN Customer c ON c.customer_id = o.customer_id
        WHERE o.order_id IN (?)
        FOR UPDATE`,
      [order_ids]
    );
    if (orders.length !== order_ids.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "ไม่พบออเดอร์บางรายการ หรือลูกค้าที่เกี่ยวข้อง" });
    }
    const [assignedOrders]: any = await connection.query(
      "SELECT order_id FROM Route_Stop WHERE order_id IN (?) FOR UPDATE",
      [order_ids]
    );
    if (assignedOrders.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: "มีออเดอร์ที่ถูกมอบหมายให้เส้นทางอื่นแล้ว" });
    }
    validatePlanRecords(
      { routes: [{ rider_id: Number(req.params.id), order_ids }] },
      [riders[0] as RiderRecord],
      orders as DeliveryOrderRecord[],
      []
    );

    const [dateRows]: any = await connection.query(
      "SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS plan_date"
    );
    const plannedRoute = calculateRoute(
      riders[0] as RiderRecord,
      orders as DeliveryOrderRecord[],
      order_ids,
      0,
      dateRows[0].plan_date,
      false
    );
    const totalDistance = plannedRoute.total_distance_km;
    const totalTime = plannedRoute.total_time_minutes;
    const deliveryCost = plannedRoute.delivery_cost;
    const revenue = plannedRoute.revenue;
    const foodCost = plannedRoute.food_cost;
    const totalProfit = plannedRoute.profit;

    const [planResult]: any = await connection.query(
      `INSERT INTO Delivery_Plan
        (delivery_date, start_time, total_distance, total_time, total_cost, total_profit, status)
       VALUES (CURRENT_DATE(), ?, ?, ?, ?, ?, ?)`,
      [START_TIME, totalDistance, totalTime, deliveryCost + foodCost, totalProfit, "คำนวณแล้ว"]
    );
    const planId = planResult.insertId;
    const workNo = requestedWorkNo?.trim()
      ?? `JOB-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const color = plannedRoute.route_color;

    const [routeResult]: any = await connection.query(
      `INSERT INTO Rider_Route
        (plan_id, rider_id, work_no, route_color, total_distance, total_time, delivery_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [planId, req.params.id, workNo, color, totalDistance, totalTime, deliveryCost]
    );
    const routeId = routeResult.insertId;
    const stopValues = plannedRoute.orders.map((order) => [
        routeId,
        order.order_id,
        order.stop_sequence,
        order.segment_distance_km,
        order.estimated_time,
        order.delivery_status,
      ]);
    await connection.query(
      `INSERT INTO Route_Stop
        (route_id, order_id, stop_sequence, distance, estimated_time, delivery_status)
       VALUES ?`,
      [stopValues]
    );
    await connection.query("UPDATE Rider SET status = ? WHERE rider_id = ?", ["กำลังส่ง", req.params.id]);
    await connection.query(
      "UPDATE `Order` SET status = ? WHERE order_id IN (?)",
      ["กำลังจัดส่ง", order_ids]
    );
    await connection.commit();
    transactionStarted = false;

    res.status(201).json({
      plan_id: planId,
      route_id: routeId,
      rider_id: Number(req.params.id),
      work_no: workNo,
      route_color: color,
      start_point: plannedRoute.start_point,
      start_time: START_TIME,
      distance_method: plannedRoute.distance_method,
      total_distance_km: totalDistance,
      total_time_minutes: totalTime,
      estimated_end_time: plannedRoute.orders.at(-1)?.estimated_time ?? null,
      delivery_cost: deliveryCost,
      revenue,
      food_cost: foodCost,
      profit: totalProfit,
      total_boxes: plannedRoute.total_boxes,
      on_time: plannedRoute.on_time,
      orders: plannedRoute.orders,
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    if (error instanceof DeliveryPlanError)
      return res.status(error.statusCode).json({ code: error.code, message: error.message });
    console.error("Failed to assign rider orders:", error);
    res.status(500).json({ message: "ไม่สามารถมอบหมายออเดอร์ให้ไรเดอร์ได้" });
  } finally {
    connection.release();
  }
});

// POST /rider/job-lookup  body: { rider_id, work_no }
router.post("/job-lookup", async (req, res) => {
  const { rider_id, work_no } = req.body ?? {};
  if (!isPositiveInteger(rider_id) || typeof work_no !== "string" || !work_no.trim())
    return res.status(400).json({ message: "กรุณาระบุ rider_id และ work_no ให้ถูกต้อง" });
  try {
    const [rows]: any = await conn.query(
      `SELECT r.rider_id, r.rider_name, rr.work_no, rr.route_color,
              rr.total_distance, rr.total_time, rr.delivery_cost,
              rs.stop_sequence, rs.distance AS segment_distance,
              rs.estimated_time, rs.delivery_status,
              o.order_id, o.box_quantity,
              c.customer_id, c.first_name, c.last_name, c.phone, c.address,
              c.latitude, c.longitude
         FROM Rider_Route rr
         JOIN Rider r ON r.rider_id = rr.rider_id
         JOIN Route_Stop rs ON rs.route_id = rr.route_id
         JOIN \`Order\` o ON o.order_id = rs.order_id
         JOIN Customer c ON c.customer_id = o.customer_id
        WHERE rr.rider_id = ? AND rr.work_no = ?
        ORDER BY rs.stop_sequence`,
      [rider_id, work_no.trim()]
    );
    if (!rows.length) return res.status(404).json({ message: "ไม่พบใบงานของไรเดอร์นี้" });
    const first = rows[0];
    res.json({
      rider_id: first.rider_id,
      rider_name: first.rider_name,
      work_no: first.work_no,
      route_color: first.route_color,
      total_distance_km: Number(first.total_distance),
      total_time_minutes: Number(first.total_time),
      delivery_cost: Number(first.delivery_cost),
      total_boxes: rows.reduce((sum: number, row: any) => sum + Number(row.box_quantity), 0),
      orders: rows.map((row: any) => ({
        order_id: row.order_id,
        customer_id: row.customer_id,
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
      })),
    });
  } catch (error) {
    console.error("Failed to look up rider job:", error);
    res.status(500).json({ message: "ไม่สามารถค้นหาใบงานได้" });
  }
});

// GET /rider/job/:riderId/:orderId (รองรับหน้ารายละเอียดจุดส่งเดิม)
router.get("/job/:riderId/:orderId", async (req, res) => {
  try {
    const [rows]: any = await conn.query(
      `SELECT r.rider_id, r.rider_name, rr.work_no, rr.route_color,
              rs.stop_sequence, rs.estimated_time, rs.delivery_status,
              o.order_id, o.box_quantity,
              c.customer_id, c.first_name, c.last_name, c.phone, c.address,
              c.latitude, c.longitude
         FROM Rider_Route rr
         JOIN Rider r ON r.rider_id = rr.rider_id
         JOIN Route_Stop rs ON rs.route_id = rr.route_id
         JOIN \`Order\` o ON o.order_id = rs.order_id
         JOIN Customer c ON c.customer_id = o.customer_id
        WHERE r.rider_id = ? AND o.order_id = ?`,
      [req.params.riderId, req.params.orderId]
    );
    if (!rows.length) return res.status(404).json({ message: "ไม่พบงานส่งของนี้" });
    res.json(rows[0]);
  } catch (error) {
    console.error("Failed to fetch rider job stop:", error);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลงานส่งของได้" });
  }
});
