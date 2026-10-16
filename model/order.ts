export const MAX_BOXES_PER_ORDER = 3;
export const DEFAULT_ORDER_STATUS = "รอจัดส่ง";

export interface Order {
  order_id: number;
  customer_id: number;
  order_date: Date;
  box_quantity: number;
  status: string;
}

export function validateQuantity(q: any): string | null {
  const n = Number(q);
  if (q === undefined || !Number.isInteger(n) || n < 1 || n > MAX_BOXES_PER_ORDER)
    return `จำนวนกล่อง (box_quantity) ต้องเป็นจำนวนเต็ม 1-${MAX_BOXES_PER_ORDER}`;
  return null;
}