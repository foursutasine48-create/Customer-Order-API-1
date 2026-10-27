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

export interface DeliveryPlanPreviewRoute {
  rider_id: number;
  rider_name: string;
  route_color: string;
  total_distance_km: number;
  total_time_minutes: number;
  total_boxes: number;
  delivery_cost: number;
  food_cost: number;
  revenue: number;
  profit: number;
  on_time: boolean;
  orders: Array<RiderRouteStop & { on_time?: boolean }>;
}

export interface DeliveryPlanPreview {
  deadline_time?: string;
  total_distance_km: number;
  total_time_minutes: number;
  total_boxes: number;
  delivery_cost: number;
  food_cost: number;
  revenue: number;
  profit: number;
  on_time: boolean;
  routes: DeliveryPlanPreviewRoute[];
}

export interface AutomaticDeliveryPlanPreview extends DeliveryPlanPreview {
  confirmation_request: {
    routes: Array<{ rider_id: number; order_ids: number[] }>;
  };
}

export interface ConfirmedDeliveryPlan extends DeliveryPlanPreview {
  plan_id: number;
  routes: Array<DeliveryPlanPreviewRoute & {
    plan_id: number;
    route_id: number;
    work_no: string;
  }>;
}

export interface DeliveryPlanDetail extends DeliveryPlanListItem {
  total_profit: number;
  distance_method: string;
  start_point: { lat: number; lng: number };
  routes: DeliveryPlanRoute[];
}
