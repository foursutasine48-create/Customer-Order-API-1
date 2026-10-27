export type OrderStatus = 'รอดำเนินการ' | 'กำลังจัดส่ง' | 'จัดส่งแล้ว' | 'ยกเลิก';

export interface CustomerOrder {
  order_id: number;
  customer_id: number;
  order_date: string;
  box_quantity: number;
  status: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number;
}
