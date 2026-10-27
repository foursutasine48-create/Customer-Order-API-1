import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Rider, RiderInput } from '../../models/rider.model';
import { ApiService } from '../../services/api';
import { CustomerOrderService } from '../../services/customer-order.service';

@Component({
  selector: 'app-rider',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rider.component.html',
  styleUrl: './rider.component.css'
})
export class RiderComponent implements OnInit {
  riders: Rider[] = [];
  editingId: number | null = null;
  message = '';
  loadingRiders = false;
  saving = false;
  deletingRiderId: number | null = null;
  form = this.emptyForm();

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadRiders();
  }

  private emptyForm(): RiderInput {
    return { rider_name: '', phone: '', status: 'พร้อมรับงาน' };
  }

  loadRiders(): void {
    this.loadingRiders = true;
    this.api.getRiders().pipe(finalize(() => {
      this.loadingRiders = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: riders => {
        this.riders = riders;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  isAvailable(rider: Rider): boolean {
    return rider.status === 'พร้อมรับงาน';
  }

  saveRider(): void {
    const data: RiderInput = {
      rider_name: this.form.rider_name.trim(),
      phone: this.form.phone.trim(),
      status: this.form.status,
    };

    if (!data.rider_name || !data.phone) {
      this.message = 'กรุณากรอกชื่อไรเดอร์และเบอร์โทร';
      return;
    }

    const editingId = this.editingId;
    const request = editingId === null
      ? this.api.addRider(data)
      : this.api.updateRider(editingId, data);

    this.saving = true;
    request.pipe(finalize(() => {
      this.saving = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: () => {
        this.message = editingId === null ? 'เพิ่มไรเดอร์แล้ว' : 'บันทึกข้อมูลไรเดอร์แล้ว';
        this.cancelEdit();
        this.loadRiders();
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  editRider(rider: Rider): void {
    this.editingId = rider.rider_id;
    this.form = {
      rider_name: rider.rider_name,
      phone: rider.phone,
      status: rider.status,
    };
    this.message = '';
  }

  changeStatus(rider: Rider): void {
    const newStatus = this.isAvailable(rider) ? 'ไม่พร้อมรับงาน' : 'พร้อมรับงาน';
    this.api.updateRiderStatus(rider.rider_id, newStatus).subscribe({
      next: () => {
        this.message = `เปลี่ยนสถานะเป็น "${newStatus}" แล้ว`;
        this.loadRiders();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  deleteRider(rider: Rider): void {
    if (!confirm(`ต้องการลบไรเดอร์ ${rider.rider_name} หรือไม่?`)) return;

    this.deletingRiderId = rider.rider_id;
    this.api.deleteRider(rider.rider_id).pipe(finalize(() => {
      this.deletingRiderId = null;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: result => {
        this.message = result.message;
        if (this.editingId === rider.rider_id) this.cancelEdit();
        this.loadRiders();
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
