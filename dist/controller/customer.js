"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("../dbconnect");
const customer_1 = require("../model/customer");
exports.router = express_1.default.Router();
const FIRST_NAMES = ["สมชาย", "สมหญิง", "วิชัย", "มาลี", "ประยุทธ", "สุดา", "อนุชา", "กนกวรรณ", "ธนากร", "พิมพ์ชนก", "ณัฐพล", "ชลธิชา", "รัตนา", "ศักดิ์ชัย", "จิราพร"];
const LAST_NAMES = ["ใจดี", "รักเรียน", "สุขสันต์", "มีสุข", "แสนดี", "ศรีสวัสดิ์", "พรหมมา", "วงศ์ใหญ่", "บุญมี", "ทองคำ", "สายบุญ", "เจริญผล"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
// 1.1 แสดงข้อมูลลูกค้าทุกคน
// GET /customer
exports.router.get("/", async (_req, res) => {
    try {
        const [rows] = await dbconnect_1.conn.query("SELECT * FROM Customer ORDER BY customer_id");
        res.json(rows);
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 1.2 ค้นหาจากส่วนหนึ่งของชื่อ / นามสกุล
// GET /customer/search?q=สม                       (ค้นทั้งชื่อและนามสกุล)
// GET /customer/search?first_name=สม&last_name=ใจ  (ค้นแยกช่อง)
exports.router.get("/search", async (req, res) => {
    try {
        const { q, first_name, last_name } = req.query;
        const conds = [];
        const params = [];
        if (q) {
            conds.push("(first_name LIKE ? OR last_name LIKE ?)");
            params.push(`%${q}%`, `%${q}%`);
        }
        if (first_name) {
            conds.push("first_name LIKE ?");
            params.push(`%${first_name}%`);
        }
        if (last_name) {
            conds.push("last_name LIKE ?");
            params.push(`%${last_name}%`);
        }
        if (!conds.length)
            return res.status(400).json({ message: "ระบุ q หรือ first_name หรือ last_name อย่างน้อย 1 ค่า" });
        const [rows] = await dbconnect_1.conn.query(`SELECT * FROM Customer WHERE ${conds.join(" AND ")} ORDER BY customer_id`, params);
        res.json(rows);
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 1.3 ค้นลูกค้าทั้งหมดในระยะ 1 กม. จากพิกัดที่กำหนด
// GET /customer/nearby?lat=16.2467&lng=103.2555            (ค่าเริ่มต้น radius = 1 กม.)
exports.router.get("/nearby", async (req, res) => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const radius = req.query.radius !== undefined ? Number(req.query.radius) : 1;
        if (req.query.lat === undefined || req.query.lng === undefined || ![lat, lng, radius].every(Number.isFinite) || radius <= 0)
            return res.status(400).json({ message: "ต้องระบุ lat, lng เป็นตัวเลข (radius ถ้าระบุต้องมากกว่า 0)" });
        const dist = (0, customer_1.HAVERSINE_SQL)("latitude", "longitude");
        const [rows] = await dbconnect_1.conn.query(`SELECT *, ROUND(${dist}, 3) AS distance_km
         FROM Customer
        HAVING distance_km <= ?
        ORDER BY distance_km`, [lat, lng, lat, radius]);
        res.json(rows);
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// สุ่มสร้างลูกค้าจำลองรอบมหาวิทยาลัยมหาสารคาม (รัศมี 3 กม.) ไว้ใช้ทดสอบ
// POST /customer/seed?count=30
exports.router.post("/seed", async (req, res) => {
    try {
        const count = Math.min(Math.max(Number(req.query.count) || 30, 1), 200);
        const values = [];
        for (let i = 0; i < count; i++) {
            const p = (0, customer_1.randomPointAround)(customer_1.SHOP_CENTER, customer_1.SHOP_RADIUS_KM);
            const phone = "08" + Math.floor(10000000 + Math.random() * 89999999);
            const address = `บ้านเลขที่ ${1 + Math.floor(Math.random() * 300)} อ.กันทรวิชัย จ.มหาสารคาม`;
            values.push([pick(FIRST_NAMES), pick(LAST_NAMES), phone, address, p.lat, p.lng]);
        }
        await dbconnect_1.conn.query("INSERT INTO Customer (first_name, last_name, phone, address, latitude, longitude) VALUES ?", [values]);
        res.status(201).json({ message: `สร้างลูกค้าจำลอง ${count} คนแล้ว` });
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// ดูลูกค้าคนเดียว
// GET /customer/:id
exports.router.get("/:id", async (req, res) => {
    try {
        const [rows] = await dbconnect_1.conn.query("SELECT * FROM Customer WHERE customer_id = ?", [req.params.id]);
        if (!rows.length)
            return res.status(404).json({ message: "ไม่พบลูกค้า" });
        res.json(rows[0]);
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 1.1 เพิ่มลูกค้า
// POST /customer   body: { first_name, last_name, phone, address?, latitude, longitude }
exports.router.post("/", async (req, res) => {
    const err = (0, customer_1.validateCustomer)(req.body);
    if (err)
        return res.status(400).json({ message: err });
    try {
        const { first_name, last_name, phone, address = null, latitude, longitude } = req.body;
        const [result] = await dbconnect_1.conn.query("INSERT INTO Customer (first_name, last_name, phone, address, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)", [first_name, last_name, phone, address, latitude, longitude]);
        res.status(201).json({ customer_id: result.insertId, first_name, last_name, phone, address, latitude, longitude });
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 1.1 แก้ไขลูกค้า
// PUT /customer/:id
exports.router.put("/:id", async (req, res) => {
    const err = (0, customer_1.validateCustomer)(req.body);
    if (err)
        return res.status(400).json({ message: err });
    try {
        const { first_name, last_name, phone, address = null, latitude, longitude } = req.body;
        const [result] = await dbconnect_1.conn.query("UPDATE Customer SET first_name=?, last_name=?, phone=?, address=?, latitude=?, longitude=? WHERE customer_id=?", [first_name, last_name, phone, address, latitude, longitude, req.params.id]);
        if (!result.affectedRows)
            return res.status(404).json({ message: "ไม่พบลูกค้า" });
        res.json({ customer_id: Number(req.params.id), first_name, last_name, phone, address, latitude, longitude });
    }
    catch (e) {
        res.status(500).json({ message: e.message });
    }
});
// 1.1 ลบลูกค้า (ถ้ามีรายการสั่งซื้ออยู่ ฐานข้อมูลตั้ง ON DELETE RESTRICT จึงลบไม่ได้ ต้องลบออเดอร์ก่อน)
// DELETE /customer/:id
exports.router.delete("/:id", async (req, res) => {
    try {
        const [result] = await dbconnect_1.conn.query("DELETE FROM Customer WHERE customer_id = ?", [req.params.id]);
        if (!result.affectedRows)
            return res.status(404).json({ message: "ไม่พบลูกค้า" });
        res.json({ message: "ลบลูกค้าเรียบร้อย" });
    }
    catch (e) {
        if (e.code === "ER_ROW_IS_REFERENCED_2")
            return res.status(409).json({ message: "ลบไม่ได้ ลูกค้ารายนี้ยังมีรายการสั่งซื้ออยู่ กรุณาลบรายการสั่งซื้อก่อน" });
        res.status(500).json({ message: e.message });
    }
});
//# sourceMappingURL=customer.js.map