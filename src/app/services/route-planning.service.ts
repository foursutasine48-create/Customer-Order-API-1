import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { CustomerOrder } from '../models/order.model';

export interface RiderRoute {
  riderId: number;
  stops: CustomerOrder[];
  distanceKm: number;
  roadGeometry: [number, number][];
}

export interface RoutePlan {
  origin: { latitude: number; longitude: number };
  routes: RiderRoute[];
  unassignedOrders: number;
}

interface OsrmRouteResponse {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    geometry: {
      coordinates: number[][];
    };
  }>;
}

interface OsrmTableResponse {
  code: string;
  message?: string;
  distances?: Array<Array<number | null>>;
}

@Injectable({ providedIn: 'root' })
export class RoutePlanningService {
  private readonly http = inject(HttpClient);
  private currentPlan: RoutePlan | null = null;
  private selectedRiderId: number | null = null;

  get plan(): RoutePlan | null {
    return this.currentPlan;
  }

  get selectedRoute(): RiderRoute | null {
    return this.currentPlan?.routes.find(route => route.riderId === this.selectedRiderId)
      ?? this.currentPlan?.routes[0]
      ?? null;
  }

  setPlan(plan: RoutePlan): void {
    this.currentPlan = plan;
    this.selectedRiderId = plan.routes[0]?.riderId ?? null;
  }

  clearPlan(): void {
    this.currentPlan = null;
    this.selectedRiderId = null;
  }

  selectRider(riderId: number): void {
    if (this.currentPlan?.routes.some(route => route.riderId === riderId)) {
      this.selectedRiderId = riderId;
    }
  }

  getRoadRoute(
    origin: { latitude: number; longitude: number },
    route: RiderRoute,
  ): Observable<RiderRoute> {
    if (route.stops.length === 0) {
      return of({ ...route, roadGeometry: [] });
    }

    const coordinates = [
      `${origin.longitude},${origin.latitude}`,
      ...route.stops.map(stop => `${stop.longitude},${stop.latitude}`),
    ].join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}` +
      '?overview=full&geometries=geojson&steps=false';

    return this.http.get<OsrmRouteResponse>(url).pipe(map(response => {
      const roadRoute = response.routes?.[0];
      if (response.code !== 'Ok' || !roadRoute || roadRoute.geometry.coordinates.length === 0) {
        throw new Error(response.message || 'OSRM ไม่สามารถหาเส้นทางบนถนนได้');
      }

      return {
        ...route,
        distanceKm: roadRoute.distance / 1000,
        roadGeometry: roadRoute.geometry.coordinates
          .filter((coordinate): coordinate is [number, number] =>
            coordinate.length >= 2 &&
            Number.isFinite(coordinate[0]) &&
            Number.isFinite(coordinate[1])
          ),
      };
    }));
  }

  getRoadDistanceMatrix(
    origin: { latitude: number; longitude: number },
    stops: CustomerOrder[],
  ): Observable<number[][]> {
    if (stops.length === 0) return of([[0]]);

    const coordinates = [
      `${origin.longitude},${origin.latitude}`,
      ...stops.map(stop => `${stop.longitude},${stop.latitude}`),
    ].join(';');
    const url = `https://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=distance`;

    return this.http.get<OsrmTableResponse>(url).pipe(map(response => {
      const distances = response.distances;
      const expectedSize = stops.length + 1;
      if (response.code !== 'Ok' || !distances ||
        distances.length !== expectedSize ||
        distances.some(row => row.length !== expectedSize ||
          row.some(distance => distance === null || !Number.isFinite(distance)))) {
        throw new Error(response.message || 'OSRM ไม่สามารถคำนวณระยะทางระหว่างออเดอร์ได้');
      }

      return distances.map(row => row.map(distance => Number(distance)));
    }));
  }
}
