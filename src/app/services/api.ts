import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Rider,
  RiderAssignment,
  RiderInput,
  RiderJob,
} from '../models/rider.model';

// ---------- URL ของ API ----------
// รันในเครื่อง:  'http://localhost:3000'
// ใช้งานจริง:     'https://customer-order-api-1-1pkk.onrender.com'
const API_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://customer-order-api-1-1pkk.onrender.com';

// ---------- ชนิดข้อมูล ----------
export interface Customer {
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number; // มีเฉพาะผลจาก /nearby
}

export interface CustomerInput {
  first_name: string;
  last_name: string;
  phone: string;
  address?: string | null;
  latitude: number;
  longitude: number;
}

export interface Order {
  order_id: number;
  order_date: string;
  box_quantity: number;
  status: string;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number; // มีเฉพาะผลจาก /nearby
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  // ================= ลูกค้า =================
  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${API_URL}/customer`);
  }

  searchCustomers(q: string): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${API_URL}/customer/search`, { params: { q } });
  }

  nearbyCustomers(lat: number, lng: number, radius = 1): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${API_URL}/customer/nearby`, { params: { lat, lng, radius } });
  }

  addCustomer(data: CustomerInput): Observable<Customer> {
    return this.http.post<Customer>(`${API_URL}/customer`, data);
  }

  updateCustomer(id: number, data: CustomerInput): Observable<Customer> {
    return this.http.put<Customer>(`${API_URL}/customer/${id}`, data);
  }

  deleteCustomer(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${API_URL}/customer/${id}`);
  }

  // ================= ออเดอร์ =================
  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${API_URL}/order`);
  }

  // จำลอง 20-30 รายการ (เลือกจำนวนแบบสุ่มหากไม่ได้ระบุ)
  simulateOrders(count?: number): Observable<{ message: string; orders: Order[] }> {
    const orderCount = count ?? Math.floor(Math.random() * 11) + 20;
    const url = `${API_URL}/order/simulate?count=${orderCount}`;
    return this.http.post<{ message: string; orders: Order[] }>(url, {});
  }

  // ล้างออเดอร์ทั้งหมด
  clearOrders(): Observable<{ message: string; deleted: number }> {
    return this.http.delete<{ message: string; deleted: number }>(`${API_URL}/order/clear`);
  }

  addOrder(customer_id: number, box_quantity: number): Observable<Order> {
    return this.http.post<Order>(`${API_URL}/order`, { customer_id, box_quantity });
  }

  updateOrderQuantity(id: number, box_quantity: number): Observable<Order> {
    return this.http.put<Order>(`${API_URL}/order/${id}`, { box_quantity });
  }

  deleteOrder(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${API_URL}/order/${id}`);
  }

  nearbyOrders(lat: number, lng: number, radius = 2): Observable<Order[]> {
    return this.http.get<Order[]>(`${API_URL}/order/nearby`, { params: { lat, lng, radius } });
  }

  // ================= ไรเดอร์ =================
  getRiders(): Observable<Rider[]> {
    return this.http.get<Rider[]>(`${API_URL}/rider`);
  }

  addRider(data: RiderInput): Observable<Rider> {
    return this.http.post<Rider>(`${API_URL}/rider`, data);
  }

  updateRider(id: number, data: RiderInput): Observable<Rider> {
    return this.http.put<Rider>(`${API_URL}/rider/${id}`, data);
  }

  updateRiderStatus(id: number, status: string): Observable<Pick<Rider, 'rider_id' | 'status'>> {
    return this.http.patch<Pick<Rider, 'rider_id' | 'status'>>(
      `${API_URL}/rider/${id}/status`,
      { status }
    );
  }

  deleteRider(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${API_URL}/rider/${id}`);
  }

  assignRiderOrders(riderId: number, orderIds: number[]): Observable<RiderAssignment> {
    return this.http.post<RiderAssignment>(
      `${API_URL}/rider/${riderId}/assignments`,
      { order_ids: orderIds }
    );
  }

  lookupRiderJob(riderId: number, workNo: string): Observable<RiderJob> {
    return this.http.post<RiderJob>(`${API_URL}/rider/job-lookup`, {
      rider_id: riderId,
      work_no: workNo,
    });
  }
}