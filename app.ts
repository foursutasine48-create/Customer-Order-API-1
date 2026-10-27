// import express from "express";
// import { router as index } from "./controller/index";
// import { router as trip } from "./controller/trip";

// export const app = express();

// // แปลงข้อมูลแบบข้อความทั่วไป (Text Body)

// app.use(express.text({ type: "*/*" }));

// // แปลงข้อมูลรูปแบบ JSON (JSON Body)
// app.use(express.json());

// app.use("/", index);
// app.use("/trip", trip);


import express from "express";
import cors from "cors";
import { router as index } from "./controller/index";
import { router as customer } from "./controller/customer";
import { router as order } from "./controller/order";
import { router as rider } from "./controller/rider";
import { conn } from "./dbconnect";


export const app = express();

const configuredOrigins = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "";
const allowedOrigins = [
  "http://localhost:4200",
  ...configuredOrigins.split(",").map((origin) => origin.trim()).filter(Boolean),
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// แปลงข้อมูลรูปแบบ JSON (JSON Body) — ต้องมาก่อน text
app.use(express.json());

// แปลงข้อมูลแบบข้อความทั่วไป (Text Body)
app.use(express.text({ type: "*/*" }));

app.get("/health", async (_req, res) => {
  try {
    await conn.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({ status: "unavailable", database: "disconnected" });
  }
});

app.use("/", index);
app.use("/customer", customer);
app.use("/order", order);
app.use("/rider", rider);