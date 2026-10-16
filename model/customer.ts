export interface Customer {
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

// จุดศูนย์กลางสำหรับสุ่มข้อมูลจำลอง: มหาวิทยาลัยมหาสารคาม (รัศมี 3 กม.)
export const SHOP_CENTER = { lat: 16.2467, lng: 103.2555 };
export const SHOP_RADIUS_KM = 3;

export function validateCustomer(b: any): string | null {
  if (!b || typeof b !== "object") return "ไม่พบข้อมูลที่ส่งมา";
  if (!b.first_name || typeof b.first_name !== "string") return "กรุณาระบุชื่อ (first_name)";
  if (!b.last_name || typeof b.last_name !== "string") return "กรุณาระบุนามสกุล (last_name)";
  if (!b.phone || !/^[0-9\-+ ]{9,20}$/.test(String(b.phone))) return "เบอร์โทรไม่ถูกต้อง (phone)";
  if (b.address !== undefined && b.address !== null && typeof b.address !== "string") return "address ต้องเป็นข้อความ";
  const lat = Number(b.latitude), lng = Number(b.longitude);
  if (b.latitude === undefined || !Number.isFinite(lat) || lat < -90 || lat > 90) return "latitude ไม่ถูกต้อง";
  if (b.longitude === undefined || !Number.isFinite(lng) || lng < -180 || lng > 180) return "longitude ไม่ถูกต้อง";
  return null;
}

// สุ่มจุดภายในวงกลมรัศมี radiusKm จากจุดศูนย์กลาง
export function randomPointAround(center: { lat: number; lng: number }, radiusKm: number) {
  const r = radiusKm * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  const dLat = (r * Math.cos(theta)) / 111.32;
  const dLng = (r * Math.sin(theta)) / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return {
    lat: +(center.lat + dLat).toFixed(7),
    lng: +(center.lng + dLng).toFixed(7),
  };
}

// สูตร Haversine (กม.) ใช้ใน SQL — ต้องส่งพารามิเตอร์ตามลำดับ: lat, lng, lat
export const HAVERSINE_SQL = (latCol: string, lngCol: string) =>
  `(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(${latCol})) * COS(RADIANS(${lngCol}) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(${latCol})))))`;