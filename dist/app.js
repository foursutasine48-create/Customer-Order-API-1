"use strict";
// import express from "express";
// import { router as index } from "./controller/index";
// import { router as trip } from "./controller/trip";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// export const app = express();
// // แปลงข้อมูลแบบข้อความทั่วไป (Text Body)
// app.use(express.text({ type: "*/*" }));
// // แปลงข้อมูลรูปแบบ JSON (JSON Body)
// app.use(express.json());
// app.use("/", index);
// app.use("/trip", trip);
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const index_1 = require("./controller/index");
const customer_1 = require("./controller/customer");
const order_1 = require("./controller/order");
const rider_1 = require("./controller/rider");
const dbconnect_1 = require("./dbconnect");
exports.app = (0, express_1.default)();
const configuredOrigins = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "";
const allowedOrigins = [
    "http://localhost:4200",
    ...configuredOrigins.split(",").map((origin) => origin.trim()).filter(Boolean),
];
exports.app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// แปลงข้อมูลรูปแบบ JSON (JSON Body) — ต้องมาก่อน text
exports.app.use(express_1.default.json());
// แปลงข้อมูลแบบข้อความทั่วไป (Text Body)
exports.app.use(express_1.default.text({ type: "*/*" }));
exports.app.get("/health", async (_req, res) => {
    try {
        await dbconnect_1.conn.query("SELECT 1");
        res.json({ status: "ok", database: "connected" });
    }
    catch (error) {
        console.error("Health check failed:", error);
        res.status(503).json({ status: "unavailable", database: "disconnected" });
    }
});
exports.app.use("/", index_1.router);
exports.app.use("/customer", customer_1.router);
exports.app.use("/order", order_1.router);
exports.app.use("/rider", rider_1.router);
//# sourceMappingURL=app.js.map