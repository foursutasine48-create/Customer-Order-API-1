import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { Customer } from '../../models/customer.model';
import { CustomerOrder } from '../../models/order.model';
import { CustomerOrderService } from '../../services/customer-order.service';

interface OrderForm {
  customer_id: number;
  box_quantity: number;
}

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './order.component.html',
  styleUrl: './order.component.css'
})
export class OrderComponent implements OnInit {
  customers: Customer[] = [];
  orders: CustomerOrder[] = [];
  searchText = '';
  searchLatitude: number | null = 16.245;
  searchLongitude: number | null = 103.25;
  searchRadiusKm = 2;
  editingId: number | null = null;
  message = '';
  saving = false;
  deletingOrderId: number | null = null;
  simulating = false;
  clearing = false;
  form: OrderForm = this.emptyForm();

  constructor(
    private data: CustomerOrderService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadCustomers();
    this.loadOrders();
  }

  get filteredOrders(): CustomerOrder[] {
    const query = this.searchText.trim().toLowerCase();
    if (!query) return this.orders;
    return this.orders.filter(order =>
      `${order.order_id} ${order.customer_id} ${this.customerName(order)} ${order.status} ${order.order_date}`
        .toLowerCase().includes(query)
    );
  }

  private emptyForm(): OrderForm {
    return { customer_id: 0, box_quantity: 1 };
  }

  private loadCustomers(): void {
    this.data.getCustomers().subscribe({
      next: items => {
        this.customers = items;
        if (!this.customers.some(customer => customer.customer_id === this.form.customer_id)) {
          this.form.customer_id = this.customers[0]?.customer_id ?? 0;
        }
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  loadOrders(): void {
    this.data.getOrders().subscribe({
      next: items => {
        this.orders = CustomerOrderService.addDistances(
          items, this.searchLatitude, this.searchLongitude
        );
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  customerName(order: CustomerOrder): string {
    return order.first_name && order.last_name
      ? `${order.first_name} ${order.last_name}`
      : 'ไม่พบข้อมูลลูกค้า';
  }

  save(): void {
    if (this.saving) return;
    if (this.editingId === null &&
      !this.customers.some(customer => customer.customer_id === Number(this.form.customer_id))) {
      this.message = 'กรุณาเลือกลูกค้าที่มีอยู่ในระบบ';
      return;
    }
    const quantity = Number(this.form.box_quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.message = 'จำนวนข้าวกล่องต้องเป็นจำนวนเต็มตั้งแต่ 1 กล่องขึ้นไป';
      return;
    }

    const editingId = this.editingId;
    const request = editingId === null
      ? this.data.addOrder(Number(this.form.customer_id), quantity)
      : this.data.updateOrderQuantity(editingId, quantity);

    this.saving = true;
    request.pipe(finalize(() => {
      this.saving = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: () => {
        const successMessage = editingId === null ? 'บันทึกออเดอร์แล้ว' : 'บันทึกจำนวนกล่องแล้ว';
        this.cancelEdit();
        this.message = successMessage;
        this.loadOrders();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  edit(order: CustomerOrder): void {
    this.editingId = order.order_id;
    this.form = { customer_id: order.customer_id, box_quantity: order.box_quantity };
    this.message = '';
  }

  remove(order: CustomerOrder): void {
    if (this.deletingOrderId !== null) return;
    this.deletingOrderId = order.order_id;
    this.data.deleteOrder(order.order_id)
      .pipe(finalize(() => {
        this.deletingOrderId = null;
        this.changeDetector.markForCheck();
      }))
      .subscribe({
      next: () => {
        this.message = 'ลบออเดอร์แล้ว';
        if (this.editingId === order.order_id) this.cancelEdit();
        this.loadOrders();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      },
      });
  }

  simulateOrders(): void {
    if (this.simulating || this.clearing) return;
    this.simulating = true;
    this.data.simulateOrders().pipe(finalize(() => {
      this.simulating = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: result => {
        this.message = result.message || `จำลองออเดอร์แล้ว ${result.orders.length} รายการ`;
        this.loadOrders();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  clearOrders(): void {
    if (this.clearing || this.simulating) return;
    if (!confirm('ต้องการลบรายการออเดอร์ทั้งหมดหรือไม่?')) return;
    this.clearing = true;
    this.data.clearOrders().pipe(finalize(() => {
      this.clearing = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: result => {
        this.orders = [];
        this.message = result.message || `ลบออเดอร์แล้ว ${result.deleted} รายการ`;
        this.cancelEdit();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  findNearby(): void {
    const latitude = this.searchLatitude;
    const longitude = this.searchLongitude;
    if (latitude === null || longitude === null ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      !Number.isFinite(this.searchRadiusKm) || this.searchRadiusKm <= 0) {
      this.message = 'กรุณาระบุพิกัดให้ถูกต้องและรัศมีมากกว่า 0 กิโลเมตร';
      return;
    }
    const radius = this.searchRadiusKm;
    this.data.nearbyOrders(latitude, longitude, radius).subscribe({
      next: items => {
        this.orders = CustomerOrderService.addDistances(items, latitude, longitude);
        this.message = `พบออเดอร์ ${items.length} รายการ ในระยะ ${radius} กิโลเมตร`;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      },
    });
  }

  showAllOrders(): void {
    this.searchText = '';
    this.message = '';
    this.loadOrders();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.form = this.emptyForm();
  }
}
