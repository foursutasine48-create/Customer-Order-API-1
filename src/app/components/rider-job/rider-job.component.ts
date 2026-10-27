import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { RiderJob } from '../../models/rider.model';
import { CustomerOrderService } from '../../services/customer-order.service';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-rider-job',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './rider-job.component.html',
  styleUrl: './rider-job.component.css'
})
export class RiderJobComponent implements OnInit {
  job: RiderJob | null = null;
  message = '';
  loading = false;

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const riderId = Number(this.route.snapshot.queryParamMap.get('rider_id'));
    const workNo = this.route.snapshot.queryParamMap.get('work_no')?.trim() ?? '';

    if (!Number.isInteger(riderId) || riderId <= 0 || !workNo) {
      this.message = 'กรุณาเปิดใบงานจากหน้าเข้าสู่ใบงาน';
      return;
    }

    this.loading = true;
    this.api.lookupRiderJob(riderId, workNo).pipe(finalize(() => {
      this.loading = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: job => {
        this.job = job;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }
}
