export declare const MAX_BOXES_PER_ORDER = 3;
export declare const DEFAULT_ORDER_STATUS = "\u0E23\u0E2D\u0E08\u0E31\u0E14\u0E2A\u0E48\u0E07";
export interface Order {
    order_id: number;
    customer_id: number;
    order_date: Date;
    box_quantity: number;
    status: string;
}
export declare function validateQuantity(q: any): string | null;
//# sourceMappingURL=order.d.ts.map