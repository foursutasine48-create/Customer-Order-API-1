import express from "express";
import { conn } from "../dbconnect";
import { Trip } from "../model/trip";

export const router = express.Router();

let latestTripBody: string | undefined;

router.post("/", (req, res) => {
  if (typeof req.body !== "string") {
    res.status(400).send("Expected a text/plain request body.");
    return;
  }

  latestTripBody = req.body;
  res.send("Get in trip.ts body: " + latestTripBody);
});

router.post("/", (req, res) => {
  let body = req.body;
  res.status(201);
  res.send(JSON.stringify(body));
});

router.post("/", (req, res) => {
  let body = req.body;
  res.status(201);
  res.json(body);
});

router.post("/", (req, res) => {
  let body = req.body;
  res.status(201).json(body);
});

router.get("/", async (req, res) => {
  try {
    const [rows] = await conn.query("SELECT * FROM `Customer`");
    res.json(rows);
  } catch (error) {
    console.error("Failed to fetch riders:", error);
    res.status(500).json({ error: "Failed to fetch riders." });
  }
});

router.get("/:id", (req, res) => {
  res.send("Get in trip.ts id: " + req.params.id);
});


router.get("/:idx", async (req, res) => {
  // ใช้เครื่องหมาย ? (Placeholder) เสมอ เพื่อส่งตัวแปรไปแทนค่าในคำสั่ง SQL ป้องกันภัยความปลอดภัย SQL Injection
  const [rows] = await conn.query("SELECT * FROM Customer WHERE idx = ?", [
    req.params.idx,
  ]);
  res.json(rows);
});

router.get("/search/fields", async (req, res) => {
  try {
    const [rows] = await conn.query(
      "SELECT * FROM trip WHERE (idx IS NULL OR idx = ?) OR (name IS NULL OR name LIKE ?)",
      [req.query.id, "%" + req.query.name + "%"]
    );
    res.json(rows);
  } catch (error) {
    // ดักจับ Error กรณีทำงานผิดพลาด เพื่อไม่ให้ระบบหลังบ้านพังล่มไปดื้อๆ
    res.status(500).json({ error: "Internal server error" });
  }
});


router.get("/", async (req, res) => {
  const [rows] = await conn.query("SELECT * FROM Customer");
  let trips = rows as Trip[];
  res.json(trips);
});