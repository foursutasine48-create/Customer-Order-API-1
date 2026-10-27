export interface Rider {
  rider_id: number;
  rider_name: string;
  phone: string;
  status: string;
}

export interface RiderInput {
  rider_name: string;
  phone: string;
  status: string;
}

export interface RiderRouteStop {
  order_id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  box_quantity: number;
  stop_sequence: number;
  segment_distance_km: number;
  estimated_time: string;
  delivery_status?: string;
}

export interface RiderJob {
  rider_id: number;
  rider_name: string;
  work_no: string;
  route_color: string;
  total_distance_km: number;
  total_time_minutes: number;
  delivery_cost: number;
  total_boxes: number;
  orders: RiderRouteStop[];
}

export interface RiderAssignment extends RiderJob {
  plan_id: number;
  route_id: number;
}
