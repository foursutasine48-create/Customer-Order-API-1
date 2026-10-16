"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("../dbconnect");
const customer_1 = require("../model/customer");
const order_1 = require("../model/order");
exports.router = express_1.default.Router();
// ใช้สร้างลูกค้าจำลองอัตโนมัติ เมื่อลูกค้าในระบบไม่พอสำหรับจำลองออเดอร์
const FIRST_NAMES = ["สมชาย", "สมหญิง", "วิชัย", "มาลี", "ประยุทธ", "สุดา", "อนุชา", "กนกวรรณ", "ธนากร", "พิมพ์ชนก", "ณัฐพล", "ชลธิชา", "รัตนา", "ศักดิ์ชัย", "จิราพร"];
const LAST_NAMES = ["ใจดี", "รักเรียน", "สุขสันต์", "มีสุข", "แสนดี", "ศรีสวัสดิ์", "พรหมมา", "วงศ์ใหญ่", "บุญมี", "ทองคำ", "สายบุญ", "เจริญผล"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ORDER_SELECT = `
  SELECT o.order_id, o.order_date, o.box_quantity, o.status,
         c.customer_id, c.first_name, c.last_name, c.phone, c.address, c.latitude, c.longitude
    FROM \`Order\` o
    JOIN Customer c ON c.customer_id = o.customer_id`;
// 3.1 แสดงรายการสั่งซื้อทั้งหมด (พร้อมข้อมูลลูกค้าที่สั่ง)
// GET /order
exports.router.get("/", async (_req, res) => {
    try {
        const [rows] = await dbconnect_1.conn.query(`${ORDER_SELECT} ORDER BY o.order_id`);
        res.json(rows);
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 3.3 แสดงรายการสั่งซื้อทั้งหมดในระยะ 2 กม. จากพิกัดที่กำหนด
// GET /order/nearby?lat=16.2467&lng=103.2555            (ค่าเริ่มต้น radius = 2 กม.)
exports.router.get("/nearby", async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const radius = req.query.radius !== undefined ? Number(req.query.radius) : 2;
        if (req.query.lat === undefined || req.query.lng === undefined || ![lat, lng, radius].every(Number.isFinite) || radius <= 0)
            return res.status(400).json({ message: "ต้องระบุ lat, lng เป็นตัวเลข (radius ถ้าระบุต้องมากกว่า 0)" });
        const dist = (0, customer_1.HAVERSINE_SQL)("c.latitude", "c.longitude");
        const [rows] = await dbconnect_1.conn.query(`SELECT o.order_id, o.order_date, o.box_quantity, o.status,
              c.customer_id, c.first_name, c.last_name, c.phone, c.address, c.latitude, c.longitude,
              ROUND(${dist}, 3) AS distance_km
         FROM \`Order\` o
         JOIN Customer c ON c.customer_id = o.customer_id
        HAVING distance_km <= ?
        ORDER BY distance_km`, [lat, lng, lat, radius]);
        res.json(rows);
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 3.1 จำลองรายการสั่งซื้อ 20-30 รายการ (สุ่มลูกค้าที่ไม่ซ้ำกัน + สุ่มจำนวนกล่อง 1-3)
// POST /order/simulate            -> สุ่มจำนวน 20-30 รายการ
// POST /order/simulate?count=25   -> กำหนดเอง (20-30)
exports.router.post("/simulate", async (req, res) => {
    try {
        const count = req.query.count !== undefined ? Number(req.query.count) : 20 + Math.floor(Math.random() * 11);
        if (!Number.isInteger(count) || count < 20 || count > 30)
            return res.status(400).json({ message: "count ต้องเป็นจำนวนเต็ม 20-30" });
        let [customers] = await dbconnect_1.conn.query("SELECT customer_id FROM Customer ORDER BY RAND() LIMIT ?", [count]);
        // ถ้าลูกค้าในระบบไม่พอ สร้างลูกค้าจำลองเพิ่มให้เองรอบ ม.มหาสารคาม (รัศมี 3 กม.)
        const missing = count - customers.length;
        if (missing > 0) {
            const newCustomers = Array.from({ length: missing }, () => {
                const p = (0, customer_1.randomPointAround)(customer_1.SHOP_CENTER, customer_1.SHOP_RADIUS_KM);
                const phone = "08" + Math.floor(10000000 + Math.random() * 89999999);
                const address = `บ้านเลขที่ ${1 + Math.floor(Math.random() * 300)} อ.กันทรวิชัย จ.มหาสารคาม`;
                return [pick(FIRST_NAMES), pick(LAST_NAMES), phone, address, p.lat, p.lng];
            });
            await dbconnect_1.conn.query("INSERT INTO Customer (first_name, last_name, phone, address, latitude, longitude) VALUES ?", [newCustomers]);
            [customers] = await dbconnect_1.conn.query("SELECT customer_id FROM Customer ORDER BY RAND() LIMIT ?", [count]);
        }
        const values = customers.map((c) => [
            c.customer_id,
            1 + Math.floor(Math.random() * order_1.MAX_BOXES_PER_ORDER),
            order_1.DEFAULT_ORDER_STATUS,
        ]);
        const [result] = await dbconnect_1.conn.query("INSERT INTO `Order` (customer_id, box_quantity, status) VALUES ?", [values]);
        const firstId = result.insertId;
        const [rows] = await dbconnect_1.conn.query(`${ORDER_SELECT} WHERE o.order_id >= ? ORDER BY o.order_id`, [firstId]);
        res.status(201).json({ message: `จำลองรายการสั่งซื้อ ${count} รายการแล้ว`, orders: rows });
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 3.2 ล้าง (ลบทั้งหมด) รายการสั่งซื้อ
// DELETE /order/clear
// หมายเหตุ: Route_Stop อ้างอิง Order แบบ RESTRICT จึงต้องลบจุดส่งที่อ้างถึงออเดอร์ก่อน
exports.router.delete("/clear", async (_req, res) => {
    const c = await dbconnect_1.conn.getConnection();
    let transactionStarted = false;
    try {
        await c.beginTransaction();
        transactionStarted = true;
        await c.query("DELETE FROM Route_Stop");
        const [result] = await c.query("DELETE FROM `Order`");
        await c.commit();
        transactionStarted = false;
        await c.query("ALTER TABLE `Order` AUTO_INCREMENT = 1");
        res.json({ message: "ล้างรายการสั่งซื้อทั้งหมดแล้ว", deleted: result.affectedRows });
    }
    catch (e) {
        if (transactionStarted)
            await c.rollback();
        res.status(500).json({ message: e.message });
    }
    finally {
        c.release();
    }
});
// ดูออเดอร์เดียว
// GET /order/:id
exports.router.get("/:id", async (req, res) => {
    try {
        const [rows] = await dbconnect_1.conn.query(`${ORDER_SELECT} WHERE o.order_id = ?`, [req.params.id]);
        if (!rows.length)
            return res.status(404).json({ message: "ไม่พบรายการสั่งซื้อ" });
        res.json(rows[0]);
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 3.1.3 เพิ่มรายการสั่งซื้อ
// POST /order   body: { customer_id, box_quantity }
exports.router.post("/", async (req, res) => {
    const { customer_id, box_quantity } = req.body ?? {};
    const err = (0, order_1.validateQuantity)(box_quantity);
    if (err)
        return res.status(400).json({ message: err });
    try {
        const [cust] = await dbconnect_1.conn.query("SELECT customer_id FROM Customer WHERE customer_id = ?", [customer_id]);
        if (!cust.length)
            return res.status(404).json({ message: "ไม่พบลูกค้า" });
        const [result] = await dbconnect_1.conn.query("INSERT INTO `Order` (customer_id, box_quantity, status) VALUES (?, ?, ?)", [customer_id, box_quantity, order_1.DEFAULT_ORDER_STATUS]);
        res.status(201).json({ order_id: result.insertId, customer_id, box_quantity, status: order_1.DEFAULT_ORDER_STATUS });
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 3.1.3 แก้ไขจำนวนกล่อง
// PUT /order/:id   body: { box_quantity }
exports.router.put("/:id", async (req, res) => {
    const err = (0, order_1.validateQuantity)(req.body?.box_quantity);
    if (err)
        return res.status(400).json({ message: err });
    try {
        const [result] = await dbconnect_1.conn.query("UPDATE `Order` SET box_quantity = ? WHERE order_id = ?", [
            req.body.box_quantity,
            req.params.id,
        ]);
        if (!result.affectedRows)
            return res.status(404).json({ message: "ไม่พบรายการสั่งซื้อ" });
        res.json({ order_id: Number(req.params.id), box_quantity: req.body.box_quantity });
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 3.1.3 ลบรายการสั่งซื้อ (ถ้าถูกจัดอยู่ในเส้นทางส่งแล้ว ฐานข้อมูลจะไม่ให้ลบ)
// DELETE /order/:id
exports.router.delete("/:id", async (req, res) => {
    const c = await dbconnect_1.conn.getConnection();
    let transactionStarted = false;
    try {
        await c.beginTransaction();
        transactionStarted = true;
        await c.query("DELETE FROM Route_Stop WHERE order_id = ?", [req.params.id]);
        const [result] = await c.query("DELETE FROM `Order` WHERE order_id = ?", [req.params.id]);
        if (!result.affectedRows) {
            await c.rollback();
            transactionStarted = false;
            return res.status(404).json({ message: "ไม่พบรายการสั่งซื้อ" });
        }
        await c.commit();
        transactionStarted = false;
        res.json({ message: "ลบรายการสั่งซื้อเรียบร้อย" });
    }
    catch (e) {
        if (transactionStarted)
            await c.rollback();
        if (e.code === "ER_ROW_IS_REFERENCED_2")
            return res.status(409).json({ message: "ลบไม่ได้ ออเดอร์นี้ถูกจัดอยู่ในเส้นทางส่งแล้ว" });
        res.status(500).json({ message: e.message });
    }
    finally {
        c.release();
    }
});
//# sourceMappingURL=order.js.map