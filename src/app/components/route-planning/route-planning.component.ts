import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CustomerOrder } from '../../models/order.model';
import { Rider, RiderAssignment } from '../../models/rider.model';
import { ApiService } from '../../services/api';
import { CustomerOrderService } from '../../services/customer-order.service';

const SHOP_CENTER = { latitude: 16.2467, longitude: 103.2555 };

@Component({
  selector: 'app-route-planning',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './route-planning.component.html',
  styleUrl: './route-planning.component.css'
})
export class RoutePlanningComponent implements OnInit {
  riders: Rider[] = [];
  orders: CustomerOrder[] = [];
  routeOrderIds: number[] = [];
  selectedRiderId = 0;
  assignment: RiderAssignment | null = null;
  message = '';
  loading = false;
  calculating = false;
  saving = false;

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef,
    private router: Router,
    private orderService: CustomerOrderService
  ) {}

  get availableRiders(): Rider[] {
    return this.riders.filter(rider =>
      rider.status === 'ว่าง' || rider.status === 'พร้อมรับงาน'
    );
  }

  get availableOrders(): CustomerOrder[] {
    return this.orders.filter(order =>
      order.status !== 'กำลังจัดส่ง' &&
      order.status !== 'จัดส่งแล้ว' &&
      order.status !== 'ยกเลิก'
    );
  }

  get routeOrders(): CustomerOrder[] {
    return this.routeOrderIds
      .map(orderId => this.orders.find(order => order.order_id === orderId))
      .filter((order): order is CustomerOrder => order !== undefined);
  }

  get estimatedDistanceKm(): number {
    let distance = 0;
    let previous = SHOP_CENTER;

    for (const order of this.routeOrders) {
      if (order.latitude === null || order.longitude === null) continue;
      const current = { latitude: order.latitude, longitude: order.longitude };
      distance += this.distanceKm(previous, current);
      previous = current;
    }

    return Math.round(distance * 100) / 100;
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

    this.orderService.getOrders().subscribe({
      next: orders => {
        this.orders = orders;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  toggleOrder(order: CustomerOrder): void {
    const alreadySelected = this.routeOrderIds.includes(order.order_id);
    if (alreadySelected) {
      this.routeOrderIds = this.routeOrderIds.filter(id => id !== order.order_id);
      this.assignment = null;
      return;
    }

    if (this.routeOrderIds.length >= 3) {
      this.message = 'เลือกออเดอร์ได้ไม่เกิน 3 รายการต่อเส้นทาง';
      return;
    }
    if (order.latitude === null || order.longitude === null) {
      this.message = `ออเดอร์ #${order.order_id} ไม่มีพิกัดลูกค้า จึงคำนวณเส้นทางไม่ได้`;
      return;
    }

    this.routeOrderIds = [...this.routeOrderIds, order.order_id];
    this.assignment = null;
    this.message = '';
  }

  calculateRoute(): void {
    if (this.routeOrderIds.length === 0) {
      this.message = 'เลือกออเดอร์อย่างน้อย 1 รายการก่อนคำนวณ';
      return;
    }

    this.calculating = true;
    const remaining = [...this.routeOrderIds];
    const ordered: number[] = [];
    let current = SHOP_CENTER;

    while (remaining.length > 0) {
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      remaining.forEach((orderId, index) => {
        const order = this.orders.find(item => item.order_id === orderId);
        if (!order || order.latitude === null || order.longitude === null) return;
        const distance = this.distanceKm(current, {
          latitude: order.latitude,
          longitude: order.longitude
        });
        if (distance < closestDistance) {
          closestIndex = index;
          closestDistance = distance;
        }
      });

      const [nextId] = remaining.splice(closestIndex, 1);
      const nextOrder = this.orders.find(item => item.order_id === nextId);
      if (nextOrder?.latitude !== null && nextOrder?.longitude !== null && nextOrder) {
        current = { latitude: nextOrder.latitude, longitude: nextOrder.longitude };
      }
      ordered.push(nextId);
    }

    this.routeOrderIds = ordered;
    this.assignment = null;
    this.message = 'จัดลำดับจากร้านไปยังจุดที่ใกล้ที่สุดแล้ว สามารถเลื่อนลำดับเองก่อนบันทึกได้';
    this.calculating = false;
  }

  moveStop(index: number, direction: -1 | 1): void {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.routeOrderIds.length) return;

    const ids = [...this.routeOrderIds];
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    this.routeOrderIds = ids;
    this.assignment = null;
  }

  saveRoute(): void {
    const rider = this.riders.find(item => item.rider_id === Number(this.selectedRiderId));
    if (!rider || !this.availableRiders.some(item => item.rider_id === rider.rider_id)) {
      this.message = 'เลือกไรเดอร์ที่พร้อมรับงานก่อน';
      return;
    }
    if (this.routeOrderIds.length === 0 || this.routeOrderIds.length > 3) {
      this.message = 'เลือกออเดอร์ 1 ถึง 3 รายการก่อนบันทึกเส้นทาง';
      return;
    }

    this.saving = true;
    this.api.assignRiderOrders(rider.rider_id, this.routeOrderIds).pipe(finalize(() => {
      this.saving = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: assignment => {
        this.assignment = assignment;
        this.message = `สร้างแผนส่งสำเร็จ: ${assignment.work_no}`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  openMap(): void {
    if (!this.assignment) return;
    this.router.navigate(['/rider-map'], {
      queryParams: {
        rider_id: this.assignment.rider_id,
        work_no: this.assignment.work_no
      }
    });
  }

  clearRoute(): void {
    this.routeOrderIds = [];
    this.assignment = null;
    this.message = '';
  }

  private distanceKm(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
  ): number {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const latitudeDelta = radians(to.latitude - from.latitude);
    const longitudeDelta = radians(to.longitude - from.longitude);
    const value = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(radians(from.latitude))
      * Math.cos(radians(to.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }
}
