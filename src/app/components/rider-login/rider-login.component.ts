import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Rider } from '../../models/rider.model';
import { CustomerOrderService } from '../../services/customer-order.service';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-rider-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './rider-login.component.html',
  styleUrl: './rider-login.component.css'
})
export class RiderLoginComponent implements OnInit {
  riders: Rider[] = [];
  riderId = 0;
  workNo = '';
  message = '';
  loadingRiders = false;
  checkingJob = false;

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
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

  login(): void {
    const workNo = this.workNo.trim();
    if (!this.riders.some(rider => rider.rider_id === Number(this.riderId)) || !workNo) {
      this.message = 'กรุณาเลือกไรเดอร์และกรอกเลขใบงาน';
      return;
    }

    this.checkingJob = true;
    this.api.lookupRiderJob(Number(this.riderId), workNo).pipe(finalize(() => {
      this.checkingJob = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: () => {
        this.router.navigate(['/rider-job'], {
          queryParams: { rider_id: this.riderId, work_no: workNo }
        });
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }
}
