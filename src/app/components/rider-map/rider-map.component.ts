import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { RiderRoute, RoutePlanningService } from '../../services/route-planning.service';

@Component({
  selector: 'app-rider-map',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rider-map.component.html',
  styleUrl: './rider-map.component.css',
})
export class RiderMapComponent implements AfterViewInit, OnDestroy {
  readonly colors = ['#7c3aed', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#4f46e5'];
  selectedRiderId: number | null = null;

  private map?: L.Map;
  private routeLayer?: L.LayerGroup;

  constructor(
    private readonly routePlanning: RoutePlanningService,
    private readonly changeDetector: ChangeDetectorRef,
  ) {
    this.selectedRiderId = this.routePlanning.selectedRoute?.riderId ?? null;
  }

  get routes(): RiderRoute[] {
    return this.routePlanning.plan?.routes ?? [];
  }

  get selectedRoute(): RiderRoute | null {
    return this.routes.find(route => route.riderId === this.selectedRiderId) ?? null;
  }

  get origin(): { latitude: number; longitude: number } | null {
    return this.routePlanning.plan?.origin ?? null;
  }

  ngAfterViewInit(): void {
    this.map = L.map('riderRouteMap').setView([16.245, 103.25], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.drawRoute();
    setTimeout(() => this.map?.invalidateSize(), 100);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  selectRider(): void {
    if (this.selectedRiderId !== null) {
      this.routePlanning.selectRider(Number(this.selectedRiderId));
    }
    this.drawRoute();
  }

  googleMapsUrl(): string | null {
    const route = this.selectedRoute;
    const origin = this.origin;
    if (!route || !origin || route.stops.length === 0) return null;

    const destination = route.stops[route.stops.length - 1];
    const params = new URLSearchParams({
      api: '1',
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      travelmode: 'driving',
    });
    const waypoints = route.stops.slice(0, -1).slice(0, 9);
    if (waypoints.length) {
      params.set('waypoints', waypoints
        .map(order => `${order.latitude},${order.longitude}`)
        .join('|'));
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  get hasMoreGoogleMapsStops(): boolean {
    return (this.selectedRoute?.stops.length ?? 0) > 10;
  }

  colorFor(riderId: number): string {
    return this.colors[(riderId - 1) % this.colors.length];
  }

  private drawRoute(): void {
    if (!this.map || !this.routeLayer) return;
    this.routeLayer.clearLayers();
    const route = this.selectedRoute;
    const origin = this.origin;
    if (!route || !origin) {
      this.map.setView([16.245, 103.25], 12);
      this.changeDetector.markForCheck();
      return;
    }

    const color = this.colorFor(route.riderId);
    const originPoint: L.LatLngTuple = [origin.latitude, origin.longitude];
    const roadPoints: L.LatLngTuple[] = route.roadGeometry
      .map(([longitude, latitude]) => [latitude, longitude]);
    const stopPoints: L.LatLngTuple[] = route.stops.map(order =>
      [Number(order.latitude), Number(order.longitude)]
    );
    L.marker(originPoint).bindPopup('จุดเริ่มต้น').addTo(this.routeLayer);
    if (route.stops.length) {
      if (roadPoints.length > 0) {
        L.polyline(roadPoints, { color, weight: 5, opacity: 0.85 }).addTo(this.routeLayer);
      }
      route.stops.forEach((order, index) => {
        L.circleMarker(stopPoints[index], {
          radius: 8,
          color,
          fillColor: color,
          fillOpacity: 0.9,
        }).bindPopup(`จุดที่ ${index + 1} · ออเดอร์ #${order.order_id}`)
          .addTo(this.routeLayer!);
      });
      this.map.fitBounds(L.latLngBounds([originPoint, ...roadPoints, ...stopPoints]), {
        padding: [28, 28],
        maxZoom: 15,
      });
    } else {
      this.map.setView(originPoint, 13);
    }
    this.changeDetector.markForCheck();
  }
}
