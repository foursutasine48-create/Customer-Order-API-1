import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Customer } from '../models/customer.model';
import { ApiService, CustomerInput, Order } from './api';

@Injectable({ providedIn: 'root' })
export class CustomerOrderService {
  private readonly api = inject(ApiService);

  static addDistances<T extends {
    latitude: number | null;
    longitude: number | null;
    distance_km?: number;
  }>(items: T[], referenceLatitude: number | null, referenceLongitude: number | null): T[] {
    if (referenceLatitude === null || referenceLongitude === null ||
      !Number.isFinite(referenceLatitude) || !Number.isFinite(referenceLongitude)) {
      return items;
    }

    const radians = (degrees: number) => degrees * Math.PI / 180;
    return items.map(item => {
      if (item.latitude === null || item.longitude === null) {
        return { ...item, distance_km: undefined };
      }

      const latitudeDelta = radians(item.latitude - referenceLatitude);
      const longitudeDelta = radians(item.longitude - referenceLongitude);
      const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(radians(referenceLatitude)) *
        Math.cos(radians(item.latitude)) *
        Math.sin(longitudeDelta / 2) ** 2;
      const boundedHaversine = Math.min(1, Math.max(0, haversine));
      const distanceKm = 6371 * 2 *
        Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));

      return { ...item, distance_km: Math.round(distanceKm * 1000) / 1000 };
    });
  }

  getCustomers(): Observable<Customer[]> {
    return this.api.getCustomers();
  }

  searchCustomers(query: string): Observable<Customer[]> {
    return this.api.searchCustomers(query);
  }

  nearbyCustomers(latitude: number, longitude: number, radius: number): Observable<Customer[]> {
    return this.api.nearbyCustomers(latitude, longitude, radius);
  }

  addCustomer(customer: CustomerInput): Observable<Customer> {
    return this.api.addCustomer(customer);
  }

  updateCustomer(id: number, customer: CustomerInput): Observable<Customer> {
    return this.api.updateCustomer(id, customer);
  }

  deleteCustomer(id: number): Observable<{ message: string }> {
    return this.api.deleteCustomer(id);
  }

  getOrders(): Observable<Order[]> {
    return this.api.getOrders();
  }

  nearbyOrders(latitude: number, longitude: number, radius: number): Observable<Order[]> {
    return this.api.nearbyOrders(latitude, longitude, radius);
  }

  simulateOrders(): Observable<{ message: string; orders: Order[] }> {
    return this.api.simulateOrders();
  }

  clearOrders(): Observable<{ message: string; deleted: number }> {
    return this.api.clearOrders();
  }

  addOrder(customerId: number, boxQuantity: number): Observable<unknown> {
    return this.api.addOrder(customerId, boxQuantity);
  }

  updateOrderQuantity(orderId: number, boxQuantity: number): Observable<unknown> {
    return this.api.updateOrderQuantity(orderId, boxQuantity);
  }

  deleteOrder(orderId: number): Observable<{ message: string }> {
    return this.api.deleteOrder(orderId);
  }

  static errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message = (error.error as { message?: unknown } | null)?.message;
      if (typeof message === 'string' && message.trim()) return message;
      return `เชื่อมต่อ API ไม่สำเร็จ (HTTP ${error.status || 'ไม่ทราบสถานะ'})`;
    }
    return 'เกิดข้อผิดพลาดในการเชื่อมต่อ API';
  }
}
