"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("../dbconnect");
exports.router = express_1.default.Router();
let latestTripBody;
exports.router.post("/", (req, res) => {
    if (typeof req.body !== "string") {
        res.status(400).send("Expected a text/plain request body.");
        return;
    }
    latestTripBody = req.body;
    res.send("Get in trip.ts body: " + latestTripBody);
});
exports.router.post("/", (req, res) => {
    let body = req.body;
    res.status(201);
    res.send(JSON.stringify(body));
});
exports.router.post("/", (req, res) => {
    let body = req.body;
    res.status(201);
    res.json(body);
});
exports.router.post("/", (req, res) => {
    let body = req.body;
    res.status(201).json(body);
});
exports.router.get("/", async (req, res) => {
    try {
        const [rows] = await dbconnect_1.conn.query("SELECT * FROM `Customer`");
        res.json(rows);
    }
    catch (error) {
        console.error("Failed to fetch riders:", error);
        res.status(500).json({ error: "Failed to fetch riders." });
    }
});
exports.router.get("/:id", (req, res) => {
    res.send("Get in trip.ts id: " + req.params.id);
});
exports.router.get("/:idx", async (req, res) => {
    // ใช้เครื่องหมาย ? (Placeholder) เสมอ เพื่อส่งตัวแปรไปแทนค่าในคำสั่ง SQL ป้องกันภัยความปลอดภัย SQL Injection
    const [rows] = await dbconnect_1.conn.query("SELECT * FROM Customer WHERE idx = ?", [
        req.params.idx,
    ]);
    res.json(rows);
});
exports.router.get("/search/fields", async (req, res) => {
    try {
        const [rows] = await dbconnect_1.conn.query("SELECT * FROM trip WHERE (idx IS NULL OR idx = ?) OR (name IS NULL OR name LIKE ?)", [req.query.id, "%" + req.query.name + "%"]);
        res.json(rows);
    }
    catch (error) {
        // ดักจับ Error กรณีทำงานผิดพลาด เพื่อไม่ให้ระบบหลังบ้านพังล่มไปดื้อๆ
        res.status(500).json({ error: "Internal server error" });
    }
});
exports.router.get("/", async (req, res) => {
    const [rows] = await dbconnect_1.conn.query("SELECT * FROM Customer");
    let trips = rows;
    res.json(trips);
});
//# sourceMappingURL=trip.js.map