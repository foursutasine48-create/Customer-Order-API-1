export const AVAILABLE_RIDER_STATUSES = ["ว่าง", "พร้อมรับงาน"] as const;
export const MAX_ORDERS_PER_RIDER = 3;

export interface Rider {
  rider_id: number;
  rider_name: string;
  phone: string;
  status: string;
}

export function validateRider(body: any): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return "กรุณาระบุข้อมูลไรเดอร์";
  if (typeof body.rider_name !== "string" || !body.rider_name.trim())
    return "กรุณาระบุชื่อไรเดอร์ (rider_name)";
  if (typeof body.phone !== "string" || !/^[0-9\-+ ]{9,20}$/.test(body.phone))
    return "เบอร์โทรไม่ถูกต้อง (phone)";
  if (body.status !== undefined && (typeof body.status !== "string" || !body.status.trim()))
    return "สถานะไม่ถูกต้อง (status)";
  return null;
}

export function isAvailableRider(status: string): boolean {
  return (AVAILABLE_RIDER_STATUSES as readonly string[]).includes(status);
}
