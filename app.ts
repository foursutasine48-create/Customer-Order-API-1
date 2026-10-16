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
import { router as trip } from "./controller/trip";
import { router as customer } from "./controller/customer";
import { router as order } from "./controller/order";


export const app = express();

const allowedOrigins = [
  "http://localhost:4200",                 // Angular ตอนรันในเครื่อง
  "https://ชื่อเว็บคุณ.onrender.com",       // เปลี่ยนเป็น URL หน้าเว็บที่ deploy จริง
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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// แปลงข้อมูลรูปแบบ JSON (JSON Body) — ต้องมาก่อน text
app.use(express.json());

// แปลงข้อมูลแบบข้อความทั่วไป (Text Body)
app.use(express.text({ type: "*/*" }));

app.use("/", index);
app.use("/trip", trip);
app.use("/customer", customer);
app.use("/order", order);