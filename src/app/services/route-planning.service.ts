import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { CustomerOrder } from '../models/order.model';

export interface RiderRoute {
  riderId: number;
  stops: RoutableOrder[];
  distanceKm: number;
  roadGeometry: [number, number][];
}

export type RoutableOrder = CustomerOrder & { latitude: number; longitude: number };
export type RoadStop = { latitude: number; longitude: number };

export interface RoadRoute<TStop extends RoadStop = RoutableOrder> {
  riderId: number;
  stops: TStop[];
  distanceKm: number;
  roadGeometry: [number, number][];
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

  getRoadRoute<TStop extends RoadStop>(
    origin: { latitude: number; longitude: number },
    route: RoadRoute<TStop>,
  ): Observable<RoadRoute<TStop>> {
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
        throw new Error(response.message || 'ไม่สามารถหาเส้นทางบนถนนได้');
      }

      const roadGeometry = roadRoute.geometry.coordinates
        .filter((coordinate): coordinate is [number, number] =>
          coordinate.length >= 2 &&
          Number.isFinite(coordinate[0]) &&
          Number.isFinite(coordinate[1])
        );
      if (roadGeometry.length !== roadRoute.geometry.coordinates.length) {
        throw new Error('ข้อมูลเส้นทางถนนไม่ครบถ้วน');
      }

      return {
        ...route,
        distanceKm: roadRoute.distance / 1000,
        roadGeometry,
      };
    }));
  }

  getRoadDistanceMatrix(
    origin: { latitude: number; longitude: number },
    stops: RoadStop[],
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
        throw new Error(response.message || 'ไม่สามารถคำนวณระยะทางระหว่างจุดส่งได้');
      }

      return distances.map(row => row.map(distance => Number(distance)));
    }));
  }
}