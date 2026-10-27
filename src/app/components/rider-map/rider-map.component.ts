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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import * as L from 'leaflet';
import { Rider, RiderJob } from '../../models/rider.model';
import { ApiService } from '../../services/api';
import { CustomerOrderService } from '../../services/customer-order.service';

const SHOP_CENTER: L.LatLngTuple = [16.2467, 103.2555];

@Component({
  selector: 'app-rider-map',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rider-map.component.html',
  styleUrl: './rider-map.component.css'
})
export class RiderMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer?: ElementRef<HTMLDivElement>;

  riders: Rider[] = [];
  selectedRiderId = 0;
  workNo = '';
  job: RiderJob | null = null;
  googleMapsUrl = '';
  message = '';
  loading = false;

  private map?: L.Map;
  private routeLayer?: L.LayerGroup;

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef,
    private route: ActivatedRoute
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

  ngAfterViewInit(): void {
    if (!this.mapContainer) return;

    this.map = L.map(this.mapContainer.nativeElement).setView(SHOP_CENTER, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    setTimeout(() => this.map?.invalidateSize(), 100);
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
        this.googleMapsUrl = this.createGoogleMapsUrl(job);
        this.showRouteOnMap();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.job = null;
        this.googleMapsUrl = '';
        this.message = CustomerOrderService.errorMessage(error);
        this.clearRouteFromMap();
        this.changeDetector.markForCheck();
      }
    });
  }

  private showRouteOnMap(): void {
    if (!this.map || !this.routeLayer || !this.job) return;

    const routeLayer = this.routeLayer;
    routeLayer.clearLayers();
    const validStops = this.job.orders.filter(stop =>
      Number.isFinite(stop.latitude) &&
      Number.isFinite(stop.longitude) &&
      stop.latitude >= -90 && stop.latitude <= 90 &&
      stop.longitude >= -180 && stop.longitude <= 180
    );
    if (validStops.length !== this.job.orders.length) {
      this.message = 'ใบงานมีจุดส่งที่ไม่มีพิกัด จึงแสดงแผนที่ได้ไม่ครบ';
    }

    const points: L.LatLngTuple[] = [SHOP_CENTER];
    L.marker(SHOP_CENTER)
      .bindPopup('จุดเริ่มต้น: ร้าน')
      .addTo(routeLayer);

    validStops.forEach(stop => {
      const position: L.LatLngTuple = [stop.latitude, stop.longitude];
      points.push(position);
      L.marker(position)
        .bindPopup(
          `<strong>จุดที่ ${stop.stop_sequence}: ออเดอร์ #${stop.order_id}</strong><br>` +
          `${this.escapeHtml(stop.first_name)} ${this.escapeHtml(stop.last_name)}<br>` +
          `${this.escapeHtml(stop.address || 'ไม่มีที่อยู่')}`
        )
        .addTo(routeLayer);
    });

    L.polyline(points, {
      color: this.job.route_color || '#2563eb',
      weight: 5,
      opacity: 0.8
    }).addTo(routeLayer);

    this.map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 15 });
  }

  private clearRouteFromMap(): void {
    this.routeLayer?.clearLayers();
  }

  private createGoogleMapsUrl(job: RiderJob): string {
    const validStops = job.orders.filter(stop =>
      Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
    );
    if (validStops.length === 0) return '';

    const destination = validStops[validStops.length - 1];
    const waypoints = validStops.slice(0, -1)
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
