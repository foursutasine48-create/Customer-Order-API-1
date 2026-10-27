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
import { finalize, forkJoin, Observable, switchMap } from 'rxjs';
import * as L from 'leaflet';
import { DeliveryPlanPreview } from '../../models/delivery-plan.model';
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
  autoPlanning = false;
  previewing = false;
  savingPlan = false;
  alternativeNumber = 0;
  planPreview: DeliveryPlanPreview | null = null;

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
    return this.riders.filter(rider => rider.status === 'พร้อมรับงาน');
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

  get unassignedAvailableOrders(): RoutableOrder[] {
    const assignedOrderIds = new Set(
      this.routes.filter(route => route.assignment).flatMap(route => route.orderIds)
    );
    return this.availableOrders.filter(order => !assignedOrderIds.has(order.order_id));
  }

  get selectedRoute(): RouteDraft | undefined {
    return this.routes.find(route => route.id === this.selectedRouteId);
  }

  get previewOrderCount(): number {
    return this.planPreview?.routes.reduce((sum, route) => sum + route.orders.length, 0) ?? 0;
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
    if (this.autoPlanning || this.previewing || this.savingPlan) return;
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
    this.planPreview = null;
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
    if (route.assignment || this.autoPlanning || this.previewing || this.savingPlan) return;
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
    if (this.autoPlanning || this.previewing || this.savingPlan) return false;
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
    if (this.autoPlanning || this.previewing || this.savingPlan) return;
    const stops = this.ordersFor(route);
    if (stops.length === 0) {
      this.message = 'เลือกออเดอร์อย่างน้อย 1 รายการก่อนคำนวณ';
      return;
    }

    route.calculating = true;
    this.message = '';
    this.calculateRoadRoute(route).pipe(
      finalize(() => {
        route.calculating = false;
        this.changeDetector.markForCheck();
      })
    ).subscribe({
      next: calculated => {
        this.applyCalculatedRoute(route, calculated);
        this.message = `คำนวณเส้นทางถนนสำหรับไรเดอร์ #${route.riderId} แล้ว`;
      },
      error: error => {
        this.message = error instanceof Error
          ? error.message
          : CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  createAutomaticPlan(alternative = false): void {
    const riders = this.availableRiders
      .filter(rider => !this.routes.some(route => route.assignment?.rider_id === rider.rider_id))
      .sort((a, b) => a.rider_id - b.rider_id);
    const assignedOrderIds = new Set(
      this.routes.filter(route => route.assignment).flatMap(route => route.orderIds)
    );
    const missingCoordinates = this.pendingOrders.filter(order =>
      !assignedOrderIds.has(order.order_id) &&
      (order.latitude === null || order.longitude === null ||
        !this.validCoordinates(order.latitude, order.longitude))
    );
    if (missingCoordinates.length > 0) {
      this.message = `มีออเดอร์ที่ไม่มีพิกัด (${missingCoordinates.map(order => `#${order.order_id}`).join(', ')}) กรุณาแก้ข้อมูลก่อนแบ่งงาน`;
      return;
    }

    const orders = this.unassignedAvailableOrders;
    if (orders.length === 0) {
      this.message = 'ไม่มีออเดอร์ที่ยังไม่ได้มอบหมาย';
      return;
    }
    const requiredRiders = Math.ceil(orders.length / 3);
    if (riders.length < requiredRiders) {
      this.message = `ออเดอร์ ${orders.length} รายการต้องใช้ไรเดอร์พร้อมรับงานอย่างน้อย ${requiredRiders} คน (ตอนนี้มี ${riders.length} คน)`;
      return;
    }

    const unsavedRoutes = this.routes.filter(route => !route.assignment);
    if (unsavedRoutes.length > 0 && !alternative &&
      unsavedRoutes.some(route => route.orderIds.length > 0) &&
      !confirm('การแบ่งงานอัตโนมัติจะแทนที่เส้นทางที่ยังไม่ได้บันทึก ต้องการทำต่อหรือไม่?')) {
      return;
    }

    this.autoPlanning = true;
    this.previewing = false;
    this.planPreview = null;
    this.message = 'กำลังแบ่งออเดอร์ตามพื้นที่และคำนวณระยะทางถนน...';
    const variant = alternative ? this.alternativeNumber + 1 : 0;
    const retainedRoutes = this.routes.filter(route => !!route.assignment);
    if (alternative) {
      const generatedRoutes = this.buildAutomaticDrafts(orders, riders, variant);
      this.calculateGeneratedRoutes(generatedRoutes, retainedRoutes, orders.length, variant);
      return;
    }

    this.api.autoDeliveryPlan(
      orders.map(order => order.order_id),
      riders.map(rider => rider.rider_id)
    ).subscribe({
      next: automaticPlan => {
        const generatedRoutes = automaticPlan.routes.map((plannedRoute, index) => {
          const routeOrders = plannedRoute.orders
            .map(stop => this.orders.find(order => order.order_id === stop.order_id))
            .filter((order): order is RoutableOrder =>
              order !== undefined &&
              order.latitude !== null &&
              order.longitude !== null &&
              this.validCoordinates(order.latitude, order.longitude)
            );
          const id = this.nextRouteId++;
          return {
            id,
            riderId: plannedRoute.rider_id,
            stops: routeOrders,
            orderIds: plannedRoute.orders.map(stop => stop.order_id),
            distanceKm: 0,
            roadGeometry: [],
            color: plannedRoute.route_color || this.routeColor(index),
            calculated: false,
            calculating: true,
            saving: false,
            assignment: null
          };
        });
        this.calculateGeneratedRoutes(generatedRoutes, retainedRoutes, orders.length, variant);
      },
      error: error => {
        this.autoPlanning = false;
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  private calculateGeneratedRoutes(
    generatedRoutes: RouteDraft[],
    retainedRoutes: RouteDraft[],
    orderCount: number,
    variant: number
  ): void {
    this.routes = [...retainedRoutes, ...generatedRoutes];
    this.alternativeNumber = variant;
    this.selectedRouteId = generatedRoutes[0]?.id ?? retainedRoutes[0]?.id ?? null;
    this.updateMap();

    forkJoin(generatedRoutes.map(route => this.calculateRoadRoute(route))).pipe(
      finalize(() => {
        this.autoPlanning = false;
        this.changeDetector.markForCheck();
      })
    ).subscribe({
      next: calculatedRoutes => {
        generatedRoutes.forEach((route, index) => {
          this.applyCalculatedRoute(route, calculatedRoutes[index]);
        });
        this.message = `สร้างทางเลือกที่ ${variant + 1} แล้ว แบ่ง ${orderCount} ออเดอร์ให้ ${generatedRoutes.length} ไรเดอร์ตามกลุ่มพื้นที่ กรุณาตรวจแผนแล้วกดตรวจเวลาและกำไร`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        generatedRoutes.forEach(route => {
          route.calculating = false;
          this.invalidateRoute(route);
        });
        this.message = error instanceof Error
          ? `คำนวณเส้นทางอัตโนมัติไม่สำเร็จ: ${error.message}`
          : CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  previewPlan(): void {
    const routes = this.routes.filter(route => !route.assignment);
    if (routes.length === 0 || routes.some(route => !route.calculated || route.orderIds.length === 0)) {
      this.message = 'คำนวณเส้นทางให้ครบทุกไรเดอร์ก่อนตรวจเวลาและกำไร';
      return;
    }

    this.previewing = true;
    this.planPreview = null;
    this.api.previewDeliveryPlan(routes.map(route => ({
      rider_id: route.riderId,
      order_ids: route.orderIds
    }))).pipe(finalize(() => {
      this.previewing = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: preview => {
        this.planPreview = preview;
        this.message = preview.on_time
          ? 'แผนประเมินว่าทุกเส้นทางถึงก่อน 12:30 น.'
          : 'คำเตือน: มีเส้นทางที่ประเมินว่าจะถึงหลัง 12:30 น.';
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  savePlan(): void {
    const routes = this.routes.filter(route => !route.assignment);
    if (!this.planPreview || routes.length === 0) {
      this.message = 'ตรวจแผนและกำไรก่อนบันทึก';
      return;
    }
    if (routes.some(route => !route.calculated || route.orderIds.length === 0)) {
      this.message = 'คำนวณเส้นทางให้ครบทุกไรเดอร์ก่อนบันทึก';
      return;
    }

    this.savingPlan = true;
    this.api.confirmDeliveryPlan(routes.map(route => ({
      rider_id: route.riderId,
      order_ids: route.orderIds
    }))).pipe(finalize(() => {
      this.savingPlan = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: result => {
        for (const savedRoute of result.routes) {
          const route = routes.find(item => item.riderId === savedRoute.rider_id);
          if (!route) continue;
          route.assignment = {
            ...savedRoute,
            total_boxes: savedRoute.total_boxes,
            total_distance_km: savedRoute.total_distance_km,
            total_time_minutes: savedRoute.total_time_minutes,
            delivery_cost: savedRoute.delivery_cost,
            orders: savedRoute.orders
          };
        }
        this.planPreview = null;
        this.orders = this.orders.map(order =>
          routes.some(route => route.orderIds.includes(order.order_id))
            ? { ...order, status: 'กำลังจัดส่ง' }
            : order
        );
        this.message = `บันทึกแผน #${result.plan_id} แล้ว`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  private calculateRoadRoute(route: RouteDraft): Observable<RiderRoute> {
    const stops = this.ordersFor(route);
    if (stops.length === 0) throw new Error('เลือกออเดอร์ก่อนคำนวณเส้นทาง');

    return this.routeService.getRoadDistanceMatrix(SHOP_CENTER, stops).pipe(
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
      })
    );
  }

  private buildAutomaticDrafts(
    orders: RoutableOrder[],
    riders: Rider[],
    variant: number
  ): RouteDraft[] {
    const sorted = [...orders].sort((a, b) =>
      Math.atan2(a.latitude - SHOP_CENTER.latitude, a.longitude - SHOP_CENTER.longitude) -
      Math.atan2(b.latitude - SHOP_CENTER.latitude, b.longitude - SHOP_CENTER.longitude)
    );
    const gapAfter = sorted.reduce((bestIndex, order, index) => {
      const next = sorted[(index + 1) % sorted.length];
      const currentAngle = Math.atan2(
        order.latitude - SHOP_CENTER.latitude,
        order.longitude - SHOP_CENTER.longitude
      );
      let nextAngle = Math.atan2(
        next.latitude - SHOP_CENTER.latitude,
        next.longitude - SHOP_CENTER.longitude
      );
      if (index === sorted.length - 1) nextAngle += Math.PI * 2;
      let bestAngle = Math.atan2(
        sorted[bestIndex].latitude - SHOP_CENTER.latitude,
        sorted[bestIndex].longitude - SHOP_CENTER.longitude
      );
      let bestNext = Math.atan2(
        sorted[(bestIndex + 1) % sorted.length].latitude - SHOP_CENTER.latitude,
        sorted[(bestIndex + 1) % sorted.length].longitude - SHOP_CENTER.longitude
      );
      if (bestIndex === sorted.length - 1) bestNext += Math.PI * 2;
      if (bestNext < bestAngle) bestNext += Math.PI * 2;
      return nextAngle - currentAngle > bestNext - bestAngle ? index : bestIndex;
    }, 0);
    const start = (gapAfter + 1 + variant) % sorted.length;
    const rotated = [...sorted.slice(start), ...sorted.slice(0, start)];
    const groups: RoutableOrder[][] = [];
    for (let index = 0; index < rotated.length; index += 3) {
      groups.push(rotated.slice(index, index + 3));
    }
    return groups.map((group, index) => {
      const id = this.nextRouteId++;
      return {
        id,
        riderId: riders[index].rider_id,
        stops: group,
        orderIds: group.map(order => order.order_id),
        distanceKm: 0,
        roadGeometry: [],
        color: this.routeColor(index),
        calculated: false,
        calculating: true,
        saving: false,
        assignment: null
      };
    });
  }

  private applyCalculatedRoute(route: RouteDraft, calculated: RiderRoute): void {
    route.orderIds = calculated.stops.map(stop => stop.order_id);
    route.stops = calculated.stops;
    route.distanceKm = calculated.distanceKm;
    route.roadGeometry = calculated.roadGeometry;
    route.calculated = true;
    route.calculating = false;
    this.planPreview = null;
    this.updateMap();
  }

  moveStop(route: RouteDraft, index: number, direction: -1 | 1): void {
    if (route.assignment || this.autoPlanning || this.previewing || this.savingPlan) return;
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
    if (route.assignment || this.autoPlanning || this.previewing || this.savingPlan) return;
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
    this.planPreview = null;
  }

  previewForRoute(riderId: number) {
    return this.planPreview?.routes.find(route => route.rider_id === riderId);
  }

  isOnTime(estimatedTime: string): boolean {
    const time = estimatedTime.split(' ').at(-1)?.split(':');
    if (!time || time.length < 2) return false;
    const minutes = Number(time[0]) * 60 + Number(time[1]);
    return Number.isFinite(minutes) && minutes <= 12 * 60 + 30;
  }

  formatEstimatedTime(estimatedTime: string): string {
    return estimatedTime.split(' ').at(-1)?.slice(0, 5) ?? estimatedTime;
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