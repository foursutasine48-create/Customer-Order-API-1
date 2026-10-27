import { PoolConnection } from "mysql2/promise";
export declare const DELIVERY_START_TIME = "11:30:00";
export declare const AVERAGE_SPEED_KMH = 30;
export declare const RIDER_ROUND_COST = 15;
export declare const COST_PER_KM_PER_BOX = 2;
export declare const FOOD_COST_PER_BOX = 40;
export declare const SALE_PRICE_PER_BOX = 65;
export declare const DISTANCE_METHOD = "straight_line_haversine";
export interface RequestedRoute {
    rider_id: number;
    order_ids: number[];
}
export interface RequestedPlan {
    routes: RequestedRoute[];
}
export interface RiderRecord {
    rider_id: number;
    rider_name: string;
    status: string;
}
export interface DeliveryOrderRecord {
    order_id: number;
    customer_id: number;
    box_quantity: number;
    status: string;
    matched_customer_id: number | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    address: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
}
export interface PlannedStop {
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
    delivery_status: string;
}
export interface CalculatedRoute {
    rider_id: number;
    rider_name: string;
    route_color: string;
    start_point: {
        lat: number;
        lng: number;
    };
    start_time: string;
    distance_method: typeof DISTANCE_METHOD;
    total_distance_km: number;
    total_time_minutes: number;
    total_boxes: number;
    delivery_cost: number;
    food_cost: number;
    revenue: number;
    profit: number;
    on_time: boolean;
    orders: PlannedStop[];
}
export declare class DeliveryPlanError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(message: string, statusCode: number, code: string);
}
export declare function parseRequestedPlan(value: unknown): RequestedPlan;
export declare function validatePlanRecords(request: RequestedPlan, riders: RiderRecord[], orders: DeliveryOrderRecord[], assignedOrderIds: number[]): void;
export declare function calculateRoute(rider: RiderRecord, orderRecords: DeliveryOrderRecord[], requestedOrderIds: number[], routeIndex: number, planDate: string, optimizeOrder: boolean): CalculatedRoute;
export declare function routeColor(index: number): string;
export declare function formatDateTime(date: string, elapsedMinutes: number): string;
export declare function formatSqlTime(elapsedMinutes: number): string;
export declare function inTransaction<T>(connection: Pick<PoolConnection, "beginTransaction" | "commit" | "rollback">, work: () => Promise<T>): Promise<T>;
//# sourceMappingURL=delivery-plan.d.ts.map