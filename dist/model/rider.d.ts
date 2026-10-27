export declare const AVAILABLE_RIDER_STATUSES: readonly ["ว่าง", "พร้อมรับงาน"];
export declare const MAX_ORDERS_PER_RIDER = 3;
export interface Rider {
    rider_id: number;
    rider_name: string;
    phone: string;
    status: string;
}
export declare function validateRider(body: any): string | null;
export declare function isAvailableRider(status: string): boolean;
//# sourceMappingURL=rider.d.ts.map