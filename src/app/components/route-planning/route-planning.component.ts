import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, Subscription, switchMap } from 'rxjs';
import * as L from 'leaflet';
import { CustomerOrder } from '../../models/order.model';
import { CustomerOrderService } from '../../services/customer-order.service';
import { RoutePlan, RoutePlanningService, RiderRoute } from '../../services/route-planning.service';

@Component({
  selector: 'app-route-planning',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './route-planning.component.html',
  styleUrl: './route-planning.component.css',
})
export class RoutePlanningComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly colors = ['#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#4f46e5'];
  readonly maxOrdersPerRider = 3;
  orders: CustomerOrder[] = [];
  plan: RoutePlan | null = null;
  originLatitude: number | null = 16.245;
  originLongitude: number | null = 103.25;
  riderCount = 2;
  loading = false;
  routing = false;
  message = '';

  private map?: L.Map;
  private routeLayer?: L.LayerGroup;
  private ordersRequest?: Subscription;
  private routeRequest?: Subscription;

  constructor(
    private readonly data: CustomerOrderService,
    private readonly routePlanning: RoutePlanningService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  ngAfterViewInit(): void {
    this.map = L.map('routePlanningMap').setView([16.245, 103.25], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.drawRoutes();
    setTimeout(() => this.map?.invalidateSize(), 100);
  }

  ngOnDestroy(): void {
    this.ordersRequest?.unsubscribe();
    this.routeRequest?.unsubscribe();
    this.map?.remove();
  }

  get pendingOrders(): CustomerOrder[] {
    return this.orders.filter(order =>
      order.status !== 'จัดส่งแล้ว' && order.status !== 'ยกเลิก'
    );
  }

  get routes(): RiderRoute[] {
    return this.plan?.routes ?? [];
  }

  loadOrders(): void {
    this.loading = true;
    this.ordersRequest?.unsubscribe();
    this.ordersRequest = this.data.getOrders().subscribe({
      next: orders => {
        this.orders = orders;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.loading = false;
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  calculateRoutes(): void {
    const origin = {
      latitude: Number(this.originLatitude),
      longitude: Number(this.originLongitude),
    };
    if (!this.validCoordinates(origin.latitude, origin.longitude)) {
      this.message = 'กรุณาระบุพิกัดเริ่มต้นให้ถูกต้อง';
      return;
    }
    if (!Number.isInteger(this.riderCount) || this.riderCount < 1 || this.riderCount > 6) {
      this.message = 'จำนวนไรเดอร์ต้องอยู่ระหว่าง 1 ถึง 6 คน';
      return;
    }
    if (this.routing) return;

    const candidates = this.pendingOrders.filter(order =>
      order.latitude !== null && order.longitude !== null &&
      this.validCoordinates(Number(order.latitude), Number(order.longitude))
    );

    this.routeRequest?.unsubscribe();
    this.routePlanning.clearPlan();
    this.plan = null;
    this.message = 'กำลังขอเส้นทางตามถนนจาก OSRM...';
    this.drawRoutes();
    this.routing = true;
    this.routeRequest = this.routePlanning.getRoadDistanceMatrix(origin, candidates).pipe(
      switchMap(distances => {
        const routes = this.assignOrdersToRoutes(candidates, distances);
        return routes.length
          ? forkJoin(routes.map(route => this.routePlanning.getRoadRoute(origin, route)))
          : of(routes);
      }),
    ).subscribe({
      next: routes => {
        const assignedOrderCount = routes.reduce((total, route) => total + route.stops.length, 0);
        const unassignedOrders = this.pendingOrders.length - assignedOrderCount;
        this.plan = { origin, routes, unassignedOrders };
        this.routePlanning.setPlan(this.plan);
        this.message = assignedOrderCount
          ? `แบ่งออเดอร์ตามระยะทางถนนแล้ว ${assignedOrderCount} จาก ${this.pendingOrders.length} ออเดอร์ โดยจัดกลุ่มจุดส่งใกล้กัน (ไม่เกิน ${this.maxOrdersPerRider} ออเดอร์ต่อไรเดอร์)`
          : 'ไม่มีออเดอร์ที่ยังจัดส่งและมีพิกัดให้วางแผนเส้นทาง';
        this.routing = false;
        this.drawRoutes();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.routing = false;
        this.message = `ขอเส้นทางจาก OSRM ไม่สำเร็จ: ${
          error instanceof Error ? error.message : CustomerOrderService.errorMessage(error)
        }`;
        this.changeDetector.markForCheck();
      },
    });
  }

  private assignOrdersToRoutes(orders: CustomerOrder[], distances: number[][]): RiderRoute[] {
    const routeCount = Math.min(
      this.riderCount,
      Math.max(1, Math.ceil(orders.length / this.maxOrdersPerRider)),
    );
    const routes: RiderRoute[] = Array.from({ length: this.riderCount }, (_, index) => ({
      riderId: index + 1,
      stops: [],
      distanceKm: 0,
      roadGeometry: [],
    }));
    if (orders.length === 0) return routes;

    const medoids: number[] = [];
    let firstMedoid = 0;
    for (let orderIndex = 1; orderIndex < orders.length; orderIndex++) {
      if (distances[0][orderIndex + 1] > distances[0][firstMedoid + 1]) {
        firstMedoid = orderIndex;
      }
    }
    medoids.push(firstMedoid);

    while (medoids.length < routeCount) {
      let nextMedoid = -1;
      let greatestDistance = -1;
      orders.forEach((_, orderIndex) => {
        if (medoids.includes(orderIndex)) return;
        const distanceToNearestMedoid = Math.min(
          ...medoids.map(medoid => distances[orderIndex + 1][medoid + 1]),
        );
        if (distanceToNearestMedoid > greatestDistance) {
          greatestDistance = distanceToNearestMedoid;
          nextMedoid = orderIndex;
        }
      });
      if (nextMedoid < 0) break;
      medoids.push(nextMedoid);
    }

    let assignments = this.assignToMedoids(distances, medoids, orders.length);
    for (let iteration = 0; iteration < 4; iteration++) {
      const nextMedoids = medoids.map((_, routeIndex) => {
        const members = assignments
          .map((assignedRoute, orderIndex) => assignedRoute === routeIndex ? orderIndex : -1)
          .filter(orderIndex => orderIndex >= 0);
        return members.reduce((bestMedoid, candidate) => {
          const candidateCost = members.reduce((sum, member) =>
            sum + distances[candidate + 1][member + 1], 0);
          const bestCost = members.reduce((sum, member) =>
            sum + distances[bestMedoid + 1][member + 1], 0);
          return candidateCost < bestCost ? candidate : bestMedoid;
        }, members[0]);
      });
      if (nextMedoids.every((medoid, index) => medoid === medoids[index])) break;
      medoids.splice(0, medoids.length, ...nextMedoids);
      assignments = this.assignToMedoids(distances, medoids, orders.length);
    }

    assignments.forEach((routeIndex, orderIndex) => {
      if (routeIndex >= 0 && routeIndex < routes.length) {
        routes[routeIndex].stops.push(orders[orderIndex]);
      }
    });
    routes.slice(0, routeCount).forEach(route => {
      route.stops = this.orderStopsByRoadDistance(route.stops, orders, distances);
    });
    return routes;
  }

  private assignToMedoids(distances: number[][], medoids: number[], orderCount: number): number[] {
    const assignments = Array<number>(orderCount).fill(-1);
    const routeLoads = Array<number>(medoids.length).fill(0);
    const pairs = medoids.flatMap((medoid, routeIndex) =>
      Array.from({ length: orderCount }, (_, orderIndex) => ({
        routeIndex,
        orderIndex,
        distance: distances[orderIndex + 1][medoid + 1],
      }))
    ).sort((left, right) =>
      left.distance - right.distance ||
      left.orderIndex - right.orderIndex ||
      left.routeIndex - right.routeIndex
    );

    pairs.forEach(({ routeIndex, orderIndex }) => {
      if (assignments[orderIndex] < 0 &&
        routeLoads[routeIndex] < this.maxOrdersPerRider) {
        assignments[orderIndex] = routeIndex;
        routeLoads[routeIndex]++;
      }
    });
    return assignments;
  }

  private orderStopsByRoadDistance(
    stops: CustomerOrder[],
    allOrders: CustomerOrder[],
    distances: number[][],
  ): CustomerOrder[] {
    const remaining = stops.map(order => allOrders.indexOf(order));
    const ordered: number[] = [];
    let currentIndex = 0;
    while (remaining.length) {
      let nearestPosition = 0;
      for (let position = 1; position < remaining.length; position++) {
        if (distances[currentIndex][remaining[position] + 1] <
          distances[currentIndex][remaining[nearestPosition] + 1]) {
          nearestPosition = position;
        }
      }
      currentIndex = remaining.splice(nearestPosition, 1)[0] + 1;
      ordered.push(currentIndex - 1);
    }

    let improved = true;
    while (improved && ordered.length > 2) {
      improved = false;
      const currentCost = this.routeDistance(ordered, distances);
      for (let start = 0; start < ordered.length - 1 && !improved; start++) {
        for (let end = start + 1; end < ordered.length; end++) {
          const candidate = [
            ...ordered.slice(0, start),
            ...ordered.slice(start, end + 1).reverse(),
            ...ordered.slice(end + 1),
          ];
          if (this.routeDistance(candidate, distances) < currentCost) {
            ordered.splice(0, ordered.length, ...candidate);
            improved = true;
            break;
          }
        }
      }
    }
    return ordered.map(orderIndex => allOrders[orderIndex]);
  }

  private routeDistance(orderIndexes: number[], distances: number[][]): number {
    return orderIndexes.reduce((total, orderIndex, position) =>
      total + distances[position === 0 ? 0 : orderIndexes[position - 1] + 1][orderIndex + 1], 0);
  }

  selectRoute(riderId: number): void {
    this.routePlanning.selectRider(riderId);
  }

  formatDistance(distanceKm: number): string {
    return `${distanceKm.toFixed(2)} กม.`;
  }

  colorFor(index: number): string {
    return this.colors[index % this.colors.length];
  }

  private drawRoutes(): void {
    const routeLayer = this.routeLayer;
    if (!this.map || !routeLayer) return;
    routeLayer.clearLayers();
    if (!this.plan) return;

    const originPoint: L.LatLngTuple = [this.plan.origin.latitude, this.plan.origin.longitude];
    const allPoints: L.LatLngTuple[] = [originPoint];
    L.marker(originPoint).bindPopup('จุดเริ่มต้น').addTo(routeLayer);

    this.plan.routes.forEach((route, index) => {
      const roadPoints: L.LatLngTuple[] = route.roadGeometry
        .map(([longitude, latitude]) => [latitude, longitude]);
      const stopPoints: L.LatLngTuple[] = route.stops.map(order =>
        [Number(order.latitude), Number(order.longitude)]
      );
      allPoints.push(...roadPoints, ...stopPoints);
      if (roadPoints.length > 0) {
        L.polyline(roadPoints, { color: this.colorFor(index), weight: 4, opacity: 0.8 })
          .addTo(routeLayer);
      }
      route.stops.forEach((order, stopIndex) => {
        L.circleMarker(stopPoints[stopIndex], {
          radius: 7,
          color: this.colorFor(index),
          fillColor: this.colorFor(index),
          fillOpacity: 0.9,
        }).bindPopup(`ไรเดอร์ ${route.riderId} · ออเดอร์ #${order.order_id}`)
          .addTo(routeLayer);
      });
    });

    if (allPoints.length > 1) {
      this.map.fitBounds(L.latLngBounds(allPoints), { padding: [24, 24], maxZoom: 14 });
    } else {
      this.map.setView(originPoint, 13);
    }
  }

  private validCoordinates(latitude: number, longitude: number): boolean {
    return Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  }
}
