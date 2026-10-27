export interface Customer {
    customer_id: number;
    first_name: string;
    last_name: string;
    phone: string;
    address: string | null;
    latitude: number;
    longitude: number;
}
export declare const SHOP_CENTER: {
    lat: number;
    lng: number;
};
export declare const SHOP_RADIUS_KM = 3;
export declare function validateCustomer(b: any): string | null;
export declare function randomPointAround(center: {
    lat: number;
    lng: number;
}, radiusKm: number): {
    lat: number;
    lng: number;
};
export declare const HAVERSINE_SQL: (latCol: string, lngCol: string) => string;
//# sourceMappingURL=customer.d.ts.map