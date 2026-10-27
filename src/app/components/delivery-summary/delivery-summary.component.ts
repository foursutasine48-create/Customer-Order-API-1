import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { DeliveryPlanDetail, DeliveryPlanListItem } from '../../models/delivery-plan.model';
import { ApiService } from '../../services/api';
import { CustomerOrderService } from '../../services/customer-order.service';

@Component({
  selector: 'app-delivery-summary',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './delivery-summary.component.html',
  styleUrl: './delivery-summary.component.css'
})
export class DeliverySummaryComponent implements OnInit {
  plans: DeliveryPlanListItem[] = [];
  selectedPlanId = 0;
  plan: DeliveryPlanDetail | null = null;
  message = '';
  loadingPlans = false;
  loadingDetail = false;

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.loadingPlans = true;
    this.api.getDeliveryPlans().pipe(finalize(() => {
      this.loadingPlans = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: plans => {
        this.plans = plans;
        const queryPlanId = Number(this.route.snapshot.queryParamMap.get('plan_id'));
        const requestedPlan = plans.find(item => item.plan_id === queryPlanId);
        if (requestedPlan) {
          this.selectedPlanId = requestedPlan.plan_id;
          this.loadPlan();
        }
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  loadPlan(): void {
    const planId = Number(this.selectedPlanId);
    if (!Number.isInteger(planId) || planId < 1) {
      this.message = 'เลือกแผนจัดส่งก่อน';
      return;
    }

    this.loadingDetail = true;
    this.message = '';
    this.api.getDeliveryPlan(planId).pipe(finalize(() => {
      this.loadingDetail = false;
      this.changeDetector.markForCheck();
    })).subscribe({
      next: plan => {
        this.plan = plan;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.plan = null;
        this.message = CustomerOrderService.errorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }
}
