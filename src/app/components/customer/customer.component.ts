import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, Subscription } from 'rxjs';
import * as L from 'leaflet';
import { Customer } from '../../models/customer.model';
import { CustomerOrderService } from '../../services/customer-order.service';
import { CustomerInput } from '../../services/api';

type CustomerForm = Omit<Customer, 'customer_id'>;

@Component({
  selector: 'app-customer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer.component.html',
  styleUrl: './customer.component.css'
})
export class CustomerComponent implements OnInit, AfterViewInit, OnDestroy {
  customers: Customer[] = [];
  searchText = '';
  searchLatitude: number | null = 16.245;
  searchLongitude: number | null = 103.25;
  searchRadiusKm = 1;
  editingId: number | null = null;
  message = '';
  saving = false;
  deletingCustomerId: number | null = null;
  form: CustomerForm = this.emptyForm();

  private listRequest?: Subscription;
  private map?: L.Map;
  private markerLayer?: L.LayerGroup;
  private customerMarkers = new Map<number, L.Marker>();

  constructor(
    private data: CustomerOrderService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
  }

  ngAfterViewInit(): void {
    // สร้างแผนที่หลังจาก HTML พร้อมแล้ว
    this.map = L.map('customerMap').setView([16.245, 103.25], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.markerLayer = L.layerGroup().addTo(this.map);
    this.updateMapMarkers();

    // ช่วยให้แผนที่คำนวณขนาดถูกต้องหลังแสดงผล
    setTimeout(() => this.map?.invalidateSize(), 100);
  }

  ngOnDestroy(): void {
    this.listRequest?.unsubscribe();
    this.map?.remove();
  }

  get filteredCustomers(): Customer[] {
    return this.customers;
  }

  loadCustomers(): void {
    this.listRequest?.unsubscribe();
    this.listRequest = this.data.getCustomers().subscribe({
      next: items => {
        this.customers = CustomerOrderService.addDistances(
          items, this.searchLatitude, this.searchLongitude
        );
        this.updateMapMarkers();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  search(): void {
    this.listRequest?.unsubscribe();
    const query = this.searchText.trim();
    if (!query) {
      this.loadCustomers();
      return;
    }

    this.listRequest = this.data.searchCustomers(query).subscribe({
      next: items => {
        this.customers = CustomerOrderService.addDistances(
          items, this.searchLatitude, this.searchLongitude
        );
        this.updateMapMarkers();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  findNearby(): void {
    const latitude = this.searchLatitude;
    const longitude = this.searchLongitude;

    if (latitude === null || longitude === null ||
      !this.validCoordinates(latitude, longitude) ||
      !Number.isFinite(this.searchRadiusKm) || this.searchRadiusKm <= 0) {
      this.message = 'กรุณาระบุพิกัดให้ถูกต้องและรัศมีมากกว่า 0 กิโลเมตร';
      return;
    }

    const radius = this.searchRadiusKm;
    this.listRequest?.unsubscribe();
    this.listRequest = this.data.nearbyCustomers(latitude, longitude, radius).subscribe({
      next: items => {
        this.customers = CustomerOrderService.addDistances(items, latitude, longitude);
        this.updateMapMarkers();
        this.message = `พบลูกค้า ${items.length} ราย ในระยะ ${radius} กิโลเมตร`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  showAllCustomers(): void {
    this.searchText = '';
    this.message = '';
    this.loadCustomers();
  }

  // กดปุ่มในตารางเพื่อเลื่อนแผนที่ไปยังบ้านลูกค้าคนนั้น
  viewOnMap(customer: Customer): void {
    if (customer.latitude === null || customer.latitude === undefined ||
      customer.longitude === null || customer.longitude === undefined) {
      this.message = 'ลูกค้ารายนี้ยังไม่มีพิกัด Latitude/Longitude ที่ถูกต้อง';
      return;
    }

    const latitude = Number(customer.latitude);
    const longitude = Number(customer.longitude);

    if (!this.validCoordinates(latitude, longitude)) {
      this.message = 'ลูกค้ารายนี้ยังไม่มีพิกัด Latitude/Longitude ที่ถูกต้อง';
      return;
    }

    if (!this.map) {
      this.message = 'แผนที่กำลังโหลด กรุณาลองอีกครั้ง';
      return;
    }

    this.map.setView([latitude, longitude], 16);
    const marker = this.customerMarkers.get(customer.customer_id);
    marker?.openPopup();
    this.message = `แสดงตำแหน่งของ ${customer.first_name} ${customer.last_name} บนแผนที่แล้ว`;
  }

  private updateMapMarkers(): void {
    if (!this.map || !this.markerLayer) return;

    this.markerLayer.clearLayers();
    this.customerMarkers.clear();

    const validCustomers = this.customers.filter(customer =>
      customer.latitude !== null && customer.latitude !== undefined &&
      customer.longitude !== null && customer.longitude !== undefined &&
      this.validCoordinates(Number(customer.latitude), Number(customer.longitude))
    );

    validCustomers.forEach(customer => {
      const latitude = Number(customer.latitude);
      const longitude = Number(customer.longitude);

      const marker = L.marker([latitude, longitude]).addTo(this.markerLayer!);
      const name = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();
      const address = customer.address || 'ไม่มีข้อมูลที่อยู่';
      const popup = `
        <div class="customer-map-popup">
          <strong>${this.escapeHtml(name)}</strong><br>
          <span>${this.escapeHtml(address)}</span><br>
          <small>โทร: ${this.escapeHtml(customer.phone || '-')}</small><br>
          <small>พิกัด: ${latitude}, ${longitude}</small><br>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}"
             target="_blank" rel="noopener noreferrer">เปิดเส้นทางใน Google Maps</a>
        </div>
      `;
      marker.bindPopup(popup);
      this.customerMarkers.set(customer.customer_id, marker);
    });

    if (validCustomers.length > 0) {
      const first = validCustomers[0];
      this.map.setView([Number(first.latitude), Number(first.longitude)], 13);
      if (validCustomers.length > 1) {
        const bounds = L.latLngBounds(
          validCustomers.map(customer => [
            Number(customer.latitude),
            Number(customer.longitude)
          ] as L.LatLngTuple)
        );
        this.map.fitBounds(bounds, { padding: [25, 25], maxZoom: 15 });
      }
    }
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[char];
    });
  }

  private validCoordinates(latitude: number | null, longitude: number | null): boolean {
    return latitude !== null && longitude !== null &&
      Number.isFinite(latitude) && Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180;
  }

  private emptyForm(): CustomerForm {
    return {
      first_name: '',
      last_name: '',
      phone: '',
      address: '',
      latitude: null,
      longitude: null
    };
  }

  save(): void {
    if (this.saving) return;

    if (!this.form.first_name.trim() ||
      !this.form.last_name.trim() ||
      !this.form.phone.trim()) {
      this.message = 'กรุณากรอกชื่อ นามสกุล และเบอร์โทรศัพท์';
      return;
    }

    if (!/^[0-9+\-\s]{9,15}$/.test(this.form.phone.trim())) {
      this.message = 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง';
      return;
    }

    const latitude = this.form.latitude;
    const longitude = this.form.longitude;

    if (latitude === null || longitude === null ||
      !this.validCoordinates(latitude, longitude)) {
      this.message = 'กรุณาระบุพิกัดละติจูดและลองจิจูดให้ถูกต้อง';
      return;
    }

    const payload: CustomerInput = {
      first_name: this.form.first_name.trim(),
      last_name: this.form.last_name.trim(),
      phone: this.form.phone.trim(),
      address: this.form.address?.trim() || null,
      latitude,
      longitude
    };

    this.saving = true;

    if (this.editingId === null) {
      this.data.addCustomer(payload).pipe(finalize(() => {
        this.saving = false;
        this.changeDetector.markForCheck();
      })).subscribe({
        next: () => this.afterSave('เพิ่มข้อมูลลูกค้าแล้ว'),
        error: error => {
          this.message = CustomerOrderService.errorMessage(error);
          this.changeDetector.markForCheck();
        }
      });
    } else {
      this.data.updateCustomer(this.editingId, payload).pipe(finalize(() => {
        this.saving = false;
        this.changeDetector.markForCheck();
      })).subscribe({
        next: () => this.afterSave('บันทึกการแก้ไขแล้ว'),
        error: error => {
          this.message = CustomerOrderService.errorMessage(error);
          this.changeDetector.markForCheck();
        }
      });
    }
  }

  private afterSave(message: string): void {
    this.cancelEdit();
    this.message = message;
    this.changeDetector.markForCheck();
    this.loadCustomers();
  }

  edit(customer: Customer): void {
    this.editingId = customer.customer_id;
    const { customer_id, ...rest } = customer;
    this.form = { ...rest };
    this.message = '';
  }

  remove(customer: Customer): void {
    if (this.deletingCustomerId !== null) return;

    this.deletingCustomerId = customer.customer_id;
    this.data.deleteCustomer(customer.customer_id)
      .pipe(finalize(() => {
        this.deletingCustomerId = null;
        this.changeDetector.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.message = 'ลบข้อมูลลูกค้าแล้ว';
          if (this.editingId === customer.customer_id) this.cancelEdit();
          this.changeDetector.markForCheck();
          this.loadCustomers();
        },
        error: error => {
          this.message = CustomerOrderService.errorMessage(error);
          this.changeDetector.markForCheck();
        }
      });
  }

  cancelEdit(): void {
    this.editingId = null;
    this.form = this.emptyForm();
  }
}
