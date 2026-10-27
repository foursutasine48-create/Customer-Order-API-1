export interface Customer {
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number;
}
