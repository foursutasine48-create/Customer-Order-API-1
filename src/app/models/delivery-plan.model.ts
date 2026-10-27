import { RiderRouteStop } from './rider.model';

export interface DeliveryPlanSummary {
  plan_count: number;
  total_cost: number;
  total_profit: number;
  delivery_time_minutes: number;
  total_distance_km: number;
  planned_order_count: number;
  planned_box_count: number;
}

export interface DeliveryPlanListItem {
  plan_id: number;
  delivery_date: string;
  start_time: string;
  end_time: string | null;
  total_distance_km: number;
  total_time_minutes: number;
  total_cost: number;
  total_profit: number;
  status: string;
  route_count: number;
  order_count: number;
  total_boxes: number;
}

export interface DeliveryPlanRoute {
  route_id: number;
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

export interface DeliveryPlanDetail extends DeliveryPlanListItem {
  total_profit: number;
  distance_method: string;
  start_point: { lat: number; lng: number };
  routes: DeliveryPlanRoute[];
}
