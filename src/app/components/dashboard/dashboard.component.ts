import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DeliveryPlanListItem, DeliveryPlanSummary } from '../../models/delivery-plan.model';
import { Rider } from '../../models/rider.model';
import { ApiService } from '../../services/api';
import { CustomerOrderService } from '../../services/customer-order.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  orderCount = 0;
  riderCount = 0;
  planSummary: DeliveryPlanSummary | null = null;
  recentPlans: DeliveryPlanListItem[] = [];
  message = '';
  loading = false;

  constructor(
    private api: ApiService,
    private changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading = true;
    this.message = '';
    forkJoin({
      orders: this.api.getOrders(),
      riders: this.api.getRiders(),
      planSummary: this.api.getDeliveryPlanSummary(),
      plans: this.api.getDeliveryPlans()
    }).subscribe({
      next: result => {
        this.orderCount = result.orders.length;
        this.riderCount = result.riders.length;
        this.planSummary = result.planSummary;
        this.recentPlans = result.plans.slice(0, 5);
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.message = CustomerOrderService.errorMessage(error);
        this.loading = false;
        this.changeDetector.markForCheck();
      }
    });
  }
}
