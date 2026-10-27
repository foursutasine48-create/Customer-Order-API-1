import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import * as L from 'leaflet';
import { CustomerOrder } from '../../models/order.model';
import { Rider, RiderAssignment } from '../../models/rider.model';
import { ApiService } from '../../services/api';
import { CustomerOrderService } from '../../services/customer-order.service';
import {
  RiderRoute,
  RoutableOrder,
  RoutePlanningService
} from '../../services/route-planning.service';

const SHOP_CENTER = { latitude: 16.2467, longitude: 103.2555 };

interface RouteDraft extends RiderRoute {
  id: number;
  orderIds: number[];
  color: string;
  calculated: boolean;
  calculating: boolean;
  saving: boolean;
  assignment: RiderAssignment | null;
}

@Component({
  selector: 'app-route-planning',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './route-planning.component.html',
  styleUrl: './route-planning.component.css'
})
export class RoutePlanningComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  riders: Rider[] = [];
  orders: CustomerOrder[] = [];
  routes: RouteDraft[] = [];
  selectedRiderId = 0;
  selectedRouteId: number | null = null;
  loadingOrders = false;
  orderLoadError = '';
  message = '';
  loading = false;

  private map?: L.Map;
  private routeLayer?: L.LayerGroup;
  private nextRouteId = 1;

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef,
    private router: Router,
    private orderService: CustomerOrderService,
    private routeService: RoutePlanningService
  ) {}

  get availableRiders(): Rider[] {
    return this.riders.filter(rider =>
      rider.status === 'ว่าง' || rider.status === 'พร้อมรับงาน'
    );
  }

  get pendingOrders(): CustomerOrder[] {
    return this.orders.filter(order =>
      order.status !== 'กำลังจัดส่ง' &&
      order.status !== 'จัดส่งแล้ว' &&
      order.status !== 'ยกเลิก'
    );
  }

  get ordersSortedByRoute(): CustomerOrder[] {
    return [...this.pendingOrders].sort((a, b) =>
      (this.estimatedAddedDistanceKm(a) ?? Number.POSITIVE_INFINITY) -
      (this.estimatedAddedDistanceKm(b) ?? Number.POSITIVE_INFINITY)
    );
  }

  get availableOrders(): RoutableOrder[] {
    return this.pendingOrders.filter((order): order is RoutableOrder =>
      order.latitude !== null &&
      order.longitude !== null &&
      this.validCoordinates(order.latitude, order.longitude)
    );
  }

  get selectedRoute(): RouteDraft | undefined {
    return this.routes.find(route => route.id === this.selectedRouteId);
  }

  get nearestOrderId(): number | null {
    const candidates = this.availableOrders.filter(order =>
      this.canToggleOrder(order) && !this.isOrderSelected(order.order_id)
    );
    if (candidates.length === 0) return null;

    return candidates.reduce((nearest, order) =>
      (this.estimatedAddedDistanceKm(order) ?? Number.POSITIVE_INFINITY) <
      (this.estimatedAddedDistanceKm(nearest) ?? Number.POSITIVE_INFINITY)
        ? order
        : nearest
    ).order_id;
  }

  estimatedAddedDistanceKm(order: CustomerOrder): number | null {
    if (order.latitude === null || order.longitude === null ||
      !this.validCoordinates(order.latitude, order.longitude) ||
      this.isOrderSelected(order.order_id) ||
      (this.selectedRoute && this.isOrderAssigned(order.order_id, this.selectedRoute.id))) {
      return null;
    }

    const stops = this.selectedRoute ? this.ordersFor(this.selectedRoute) : [];
    if (stops.length === 0) {
      return this.distanceKm(SHOP_CENTER, {
        latitude: order.latitude,
        longitude: order.longitude
      });
    }

    const candidate = { latitude: order.latitude, longitude: order.longitude };
    let minimumAddedDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index <= stops.length; index++) {
      const previous = index === 0
        ? SHOP_CENTER
        : { latitude: stops[index - 1].latitude, longitude: stops[index - 1].longitude };
      const addedDistance = index === stops.length
        ? this.distanceKm(previous, candidate)
        : this.distanceKm(previous, candidate) +
          this.distanceKm(candidate, {
            latitude: stops[index].latitude,
            longitude: stops[index].longitude
          }) -
          this.distanceKm(previous, {
            latitude: stops[index].latitude,
            longitude: stops[index].longitude
          });
      minimumAddedDistance = Math.min(minimumAddedDistance, addedDistance);
    }

    return Math.max(0, minimumAddedDistance);
  }

  hasRouteFor(riderId: number): boolean {
    return this.routes.some(route => route.riderId === riderId);
  }

  ngOnInit(): void {
    this.loading = true;
    this.api.getRiders().pipe(finalize(() => {
      this.loading = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: riders => {
        this.riders = riders;
        this.selectedRiderId = this.availableRiders[0]?.rider_id ?? 0;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });

    this.loadingOrders = true;
    this.orderLoadError = '';
    this.orderService.getOrders().pipe(finalize(() => {
      this.loadingOrders = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: orders => {
        this.orders = orders.map(order => ({
          ...order,
          latitude: this.parseCoordinate(order.latitude),
          longitude: this.parseCoordinate(order.longitude)
        }));
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.orderLoadError = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  ngAfterViewInit(): void {
    if (!this.mapContainer) return;

    this.map = L.map(this.mapContainer.nativeElement).setView(
      [SHOP_CENTER.latitude, SHOP_CENTER.longitude], 12
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    setTimeout(() => this.map?.invalidateSize(), 100);
    this.updateMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  addRoute(): void {
    const riderId = Number(this.selectedRiderId);
    const rider = this.availableRiders.find(item => item.rider_id === riderId);
    if (!rider) {
      this.message = 'เลือกไรเดอร์ที่พร้อมรับงานก่อน';
      return;
    }
    if (this.routes.some(route => route.riderId === riderId)) {
      this.message = 'เพิ่มเส้นทางให้ไรเดอร์คนนี้แล้ว';
      return;
    }

    const route: RouteDraft = {
      id: this.nextRouteId++,
      riderId,
      stops: [],
      orderIds: [],
      distanceKm: 0,
      roadGeometry: [],
      color: this.routeColor(this.nextRouteId - 1),
      calculated: false,
      calculating: false,
      saving: false,
      assignment: null
    };
    this.routes = [...this.routes, route];
    this.selectedRouteId = route.id;
    this.message = '';
  }

  ordersFor(route: RouteDraft): RoutableOrder[] {
    return route.orderIds
      .map(orderId => this.orders.find(order => order.order_id === orderId))
      .filter((order): order is RoutableOrder =>
        order !== undefined &&
        order.latitude !== null &&
        order.longitude !== null &&
        this.validCoordinates(order.latitude, order.longitude)
      );
  }

  isOrderAssigned(orderId: number, exceptRouteId: number): boolean {
    return this.routes.some(route =>
      route.id !== exceptRouteId && route.orderIds.includes(orderId)
    );
  }

  toggleOrder(route: RouteDraft, order: RoutableOrder): void {
    if (route.assignment) return;
    if (route.orderIds.includes(order.order_id)) {
      route.orderIds = route.orderIds.filter(id => id !== order.order_id);
    } else {
      if (route.orderIds.length >= 3) {
        this.message = 'เลือกออเดอร์ได้ไม่เกิน 3 รายการต่อเส้นทาง';
        return;
      }
      if (this.isOrderAssigned(order.order_id, route.id)) {
        this.message = `ออเดอร์ #${order.order_id} ถูกเลือกให้เส้นทางอื่นแล้ว`;
        return;
      }
      route.orderIds = [...route.orderIds, order.order_id];
    }
    this.invalidateRoute(route);
    this.message = '';
    this.updateMap();
  }

  isOrderSelected(orderId: number): boolean {
    return this.selectedRoute?.orderIds.includes(orderId) ?? false;
  }

  canToggleOrder(order: CustomerOrder): boolean {
    const route = this.selectedRoute;
    if (order.latitude === null || order.longitude === null ||
      !this.validCoordinates(order.latitude, order.longitude)) {
      return false;
    }

    if (!route) {
      return this.availableRiders.some(rider =>
        rider.rider_id === Number(this.selectedRiderId)
      ) && !this.hasRouteFor(Number(this.selectedRiderId));
    }

    if (route.assignment) return false;
    return route.orderIds.includes(order.order_id) ||
      (route.orderIds.length < 3 && !this.isOrderAssigned(order.order_id, route.id));
  }

  toggleSelectedOrder(order: CustomerOrder): void {
    const routableOrder = this.availableOrders.find(item => item.order_id === order.order_id);
    if (!routableOrder) return;

    if (!this.selectedRoute) this.addRoute();
    const route = this.selectedRoute;
    if (route) this.toggleOrder(route, routableOrder);
  }

  calculateRoute(route: RouteDraft): void {
    const stops = this.ordersFor(route);
    if (stops.length === 0) {
      this.message = 'เลือกออเดอร์อย่างน้อย 1 รายการก่อนคำนวณ';
      return;
    }

    route.calculating = true;
    this.message = '';
    this.routeService.getRoadDistanceMatrix(SHOP_CENTER, stops).pipe(
      switchMap(distances => {
        const remaining = stops.map((_, index) => index);
        const ordered: RoutableOrder[] = [];
        let currentIndex = 0;
        while (remaining.length > 0) {
          let closestPosition = 0;
          let closestDistance = Number.POSITIVE_INFINITY;
          remaining.forEach((stopIndex, position) => {
            const distance = distances[currentIndex][stopIndex + 1];
            if (distance < closestDistance) {
              closestDistance = distance;
              closestPosition = position;
            }
          });
          const [nextIndex] = remaining.splice(closestPosition, 1);
          ordered.push(stops[nextIndex]);
          currentIndex = nextIndex + 1;
        }

        const draft: RiderRoute = {
          riderId: route.riderId,
          stops: ordered,
          distanceKm: 0,
          roadGeometry: []
        };
        return this.routeService.getRoadRoute(SHOP_CENTER, draft);
      }),
      finalize(() => {
        route.calculating = false;
        this.changeDetector.markForCheck();
      })
    ).subscribe({
      next: calculated => {
        route.orderIds = calculated.stops.map(stop => stop.order_id);
        route.stops = calculated.stops;
        route.distanceKm = calculated.distanceKm;
        route.roadGeometry = calculated.roadGeometry;
        route.calculated = true;
        this.updateMap();
        this.message = `คำนวณเส้นทางสำหรับไรเดอร์ #${route.riderId} แล้ว`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = error instanceof Error
          ? error.message
          : CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  moveStop(route: RouteDraft, index: number, direction: -1 | 1): void {
    if (route.assignment) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= route.orderIds.length) return;

    const orderIds = [...route.orderIds];
    [orderIds[index], orderIds[nextIndex]] = [orderIds[nextIndex], orderIds[index]];
    route.orderIds = orderIds;
    this.invalidateRoute(route);
    this.updateMap();
  }

  selectRoute(route: RouteDraft): void {
    this.selectedRouteId = route.id;
    this.updateMap();
    const points = route.roadGeometry.map(([longitude, latitude]) =>
      L.latLng(latitude, longitude)
    );
    if (this.map && points.length > 0) {
      this.map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
    }
  }

  saveRoute(route: RouteDraft): void {
    const rider = this.riders.find(item => item.rider_id === route.riderId);
    if (!rider || !this.availableRiders.some(item => item.rider_id === rider.rider_id)) {
      this.message = 'ไรเดอร์คนนี้ไม่พร้อมรับงานแล้ว กรุณาโหลดหน้าใหม่';
      return;
    }
    if (!route.calculated || route.orderIds.length === 0 || route.orderIds.length > 3) {
      this.message = 'คำนวณเส้นทางและเลือกออเดอร์ 1 ถึง 3 รายการก่อนบันทึก';
      return;
    }

    route.saving = true;
    this.api.assignRiderOrders(route.riderId, route.orderIds).pipe(finalize(() => {
      route.saving = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: assignment => {
        route.assignment = assignment;
        this.message = `บันทึกเส้นทาง ${assignment.work_no} แล้ว`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  openMap(route: RouteDraft): void {
    if (!route.assignment) return;
    this.router.navigate(['/rider-map'], {
      queryParams: {
        rider_id: route.assignment.rider_id,
        work_no: route.assignment.work_no
      }
    });
  }

  removeRoute(route: RouteDraft): void {
    if (route.assignment) return;
    this.routes = this.routes.filter(item => item.id !== route.id);
    if (this.selectedRouteId === route.id) {
      this.selectedRouteId = this.routes[0]?.id ?? null;
    }
    this.updateMap();
  }

  private invalidateRoute(route: RouteDraft): void {
    route.calculated = false;
    route.stops = this.ordersFor(route);
    route.roadGeometry = [];
    route.distanceKm = 0;
  }

  private updateMap(): void {
    if (!this.map || !this.routeLayer) return;
    const routeLayer = this.routeLayer;
    routeLayer.clearLayers();
    const start: L.LatLngTuple = [SHOP_CENTER.latitude, SHOP_CENTER.longitude];
    L.circleMarker(start, {
      radius: 8,
      color: '#25324b',
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 3
    }).bindPopup('จุดเริ่มต้น: ร้าน').addTo(routeLayer);
    const bounds: L.LatLngTuple[] = [start];

    for (const route of this.routes) {
      if (route.roadGeometry.length === 0) continue;
      const roadPoints = route.roadGeometry.map(([longitude, latitude]) =>
        [latitude, longitude] as L.LatLngTuple
      );
      L.polyline(roadPoints, {
        color: route.color,
        weight: route.id === this.selectedRouteId ? 7 : 4,
        opacity: route.id === this.selectedRouteId ? 1 : 0.7
      }).addTo(routeLayer);
      route.stops.forEach((stop, index) => {
        const point: L.LatLngTuple = [stop.latitude, stop.longitude];
        bounds.push(point);
        L.circleMarker(point, {
          radius: 9,
          color: route.color,
          fillColor: route.color,
          fillOpacity: 1,
          weight: 2
        }).bindPopup(
          `ไรเดอร์ #${route.riderId} · จุดที่ ${index + 1} · ออเดอร์ #${stop.order_id}`
        ).addTo(routeLayer);
      });
    }

    if (bounds.length > 1) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 14 });
    }
  }

  private validCoordinates(latitude: number, longitude: number): boolean {
    return Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180;
  }

  private distanceKm(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
  ): number {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const latitudeDelta = radians(to.latitude - from.latitude);
    const longitudeDelta = radians(to.longitude - from.longitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
    const boundedHaversine = Math.min(1, Math.max(0, haversine));
    return 6371 * 2 * Math.atan2(
      Math.sqrt(boundedHaversine),
      Math.sqrt(1 - boundedHaversine)
    );
  }

  private parseCoordinate(value: unknown): number | null {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;

    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate : null;
  }

  private routeColor(index: number): string {
    return `hsl(${(index * 137.508) % 360} 68% 42%)`;
  }
}
