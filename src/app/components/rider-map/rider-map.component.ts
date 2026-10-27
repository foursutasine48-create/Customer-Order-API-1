import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import * as L from 'leaflet';
import { Rider, RiderJob } from '../../models/rider.model';
import { ApiService } from '../../services/api';
import { CustomerOrderService } from '../../services/customer-order.service';
import { RoutePlanningService } from '../../services/route-planning.service';

const SHOP_CENTER: L.LatLngTuple = [16.2467, 103.2555];

@Component({
  selector: 'app-rider-map',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rider-map.component.html',
  styleUrl: './rider-map.component.css'
})
export class RiderMapComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer')
  set mapContainer(container: ElementRef<HTMLDivElement> | undefined) {
    if (!container) {
      this.map?.remove();
      this.map = undefined;
      this.routeLayer = undefined;
      return;
    }

    this.initializeMap(container.nativeElement);
  }

  riders: Rider[] = [];
  selectedRiderId = 0;
  workNo = '';
  job: RiderJob | null = null;
  googleMapsUrl = '';
  message = '';
  loading = false;
  roadRouteLoading = false;
  roadRouteError = '';
  roadDistanceKm: number | null = null;
  updatingOrderIds = new Set<number>();

  private map?: L.Map;
  private routeLayer?: L.LayerGroup;
  private roadGeometry: [number, number][] = [];

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef,
    private route: ActivatedRoute,
    private routeService: RoutePlanningService
  ) {}

  ngOnInit(): void {
    this.api.getRiders().subscribe({
      next: riders => {
        this.riders = riders;
        this.selectedRiderId = Number(this.route.snapshot.queryParamMap.get('rider_id'))
          || riders[0]?.rider_id
          || 0;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });

    const riderId = Number(this.route.snapshot.queryParamMap.get('rider_id'));
    const workNo = this.route.snapshot.queryParamMap.get('work_no')?.trim() ?? '';
    if (riderId > 0 && workNo) {
      this.selectedRiderId = riderId;
      this.workNo = workNo;
      this.loadJob();
    }
  }

  private initializeMap(element: HTMLDivElement): void {
    if (this.map) return;

    this.map = L.map(element).setView(SHOP_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    setTimeout(() => {
      this.map?.invalidateSize();
      this.showRouteOnMap();
    }, 100);
    this.showRouteOnMap();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  loadJob(): void {
    const riderId = Number(this.selectedRiderId);
    const workNo = this.workNo.trim();
    if (!Number.isInteger(riderId) || riderId <= 0 || !workNo) {
      this.message = 'เลือกไรเดอร์และกรอกเลขใบงานก่อน';
      return;
    }

    this.loading = true;
    this.message = '';
    this.api.lookupRiderJob(riderId, workNo).pipe(finalize(() => {
      this.loading = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: job => {
        this.job = job;
        this.roadGeometry = [];
        this.roadDistanceKm = null;
        this.roadRouteError = '';
        this.googleMapsUrl = this.createGoogleMapsUrl(job);
        this.showRouteOnMap();
        this.changeDetector.markForCheck();
        this.loadRoadRoute(job);
      },
      error: error => {
        this.job = null;
        this.googleMapsUrl = '';
        this.roadGeometry = [];
        this.roadDistanceKm = null;
        this.message = CustomerOrderService.errorMessage(error);
        this.clearRouteFromMap();
        this.changeDetector.markForCheck();
      }
    });
  }

  private loadRoadRoute(job: RiderJob): void {
    const stops = [...job.orders].sort((a, b) => a.stop_sequence - b.stop_sequence);
    this.roadRouteLoading = true;
    this.roadRouteError = '';
    this.routeService.getRoadRoute({
      latitude: SHOP_CENTER[0],
      longitude: SHOP_CENTER[1]
    }, {
      riderId: job.rider_id,
      stops,
      distanceKm: 0,
      roadGeometry: []
    }).pipe(finalize(() => {
      this.roadRouteLoading = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: route => {
        this.roadGeometry = route.roadGeometry;
        this.roadDistanceKm = route.distanceKm;
        this.showRouteOnMap();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.roadRouteError = error instanceof Error
          ? error.message
          : 'ไม่สามารถคำนวณเส้นทางถนนได้';
        this.showRouteOnMap();
        this.changeDetector.markForCheck();
      }
    });
  }

  markDelivered(orderId: number): void {
    if (!this.job || this.updatingOrderIds.has(orderId)) return;

    this.message = '';
    this.updatingOrderIds.add(orderId);
    this.api.markRiderOrderDelivered(
      this.job.rider_id,
      this.job.work_no,
      orderId
    ).pipe(finalize(() => {
      this.updatingOrderIds.delete(orderId);
      this.changeDetector.markForCheck();
    })).subscribe({
      next: result => {
        const stop = this.job?.orders.find(order => order.order_id === orderId);
        if (stop) stop.delivery_status = result.delivery_status;
        this.message = result.rider_status === 'พร้อมรับงาน'
          ? 'ส่งครบทุกออเดอร์แล้ว ไรเดอร์พร้อมรับงาน'
          : `ออเดอร์ #${orderId} จัดส่งแล้ว`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  private showRouteOnMap(): void {
    if (!this.map || !this.routeLayer || !this.job) return;

    const job = this.job;
    const routeColor = /^#[\da-f]{6}$/i.test(job.route_color)
      ? job.route_color
      : '#2563eb';
    const routeLayer = this.routeLayer;
    routeLayer.clearLayers();
    const validStops = job.orders.filter(stop =>
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude) &&
      stop.latitude >= -90 && stop.latitude <= 90 &&
      stop.longitude >= -180 && stop.longitude <= 180
    );
    if (validStops.length !== job.orders.length) {
      this.message = 'ใบงานมีจุดส่งที่ไม่มีพิกัด จึงแสดงแผนที่ได้ไม่ครบ';
    }

    const bounds: L.LatLngTuple[] = [SHOP_CENTER];
    L.marker(SHOP_CENTER, {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:38px;height:38px;border:3px solid white;border-radius:50%;background:#25324b;color:white;display:grid;place-items:center;font-size:11px;font-weight:700;box-shadow:0 2px 6px #0006">ร้าน</div>',
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      })
    }).bindPopup('จุดเริ่มต้น: ร้าน').addTo(routeLayer);
    validStops.forEach(stop => {
      const position: L.LatLngTuple = [stop.latitude, stop.longitude];
      bounds.push(position);
      L.marker(position, {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;border:3px solid white;border-radius:50%;background:${routeColor};color:white;display:grid;place-items:center;font-size:14px;font-weight:700;box-shadow:0 2px 6px #0006">${stop.stop_sequence}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      })
        .bindPopup(
          `<strong>จุดที่ ${stop.stop_sequence}: ออเดอร์ #${stop.order_id}</strong><br>` +
          `${this.escapeHtml(stop.first_name)} ${this.escapeHtml(stop.last_name)}<br>` +
          `${this.escapeHtml(stop.address || 'ไม่มีที่อยู่')}<br>` +
          `สถานะ: ${this.escapeHtml(stop.delivery_status || 'รอส่ง')}`
        )
        .addTo(routeLayer);
    });

    const roadPoints = this.roadGeometry.map(([longitude, latitude]) =>
      [latitude, longitude] as L.LatLngTuple
    );
    if (roadPoints.length > 0) {
      bounds.push(...roadPoints);
      L.polyline(roadPoints, {
        color: routeColor,
        weight: 5,
        opacity: 0.8
      }).addTo(routeLayer);
    }

    this.map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30], maxZoom: 15 });
  }

  private clearRouteFromMap(): void {
    this.routeLayer?.clearLayers();
  }

  private createGoogleMapsUrl(job: RiderJob): string {
    const validStops = job.orders.filter(stop =>
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude) &&
      stop.latitude >= -90 && stop.latitude <= 90 &&
      stop.longitude >= -180 && stop.longitude <= 180
    );
    if (validStops.length === 0) return '';

    const orderedStops = [...validStops].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const destination = orderedStops[orderedStops.length - 1];
    const waypoints = orderedStops.slice(0, -1)
      .map(stop => `${stop.latitude},${stop.longitude}`)
      .join('|');
    const params = new URLSearchParams({
      api: '1',
      origin: `${SHOP_CENTER[0]},${SHOP_CENTER[1]}`,
      destination: `${destination.latitude},${destination.longitude}`,
      travelmode: 'driving'
    });
    if (waypoints) params.set('waypoints', waypoints);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[character];
    });
  }
}