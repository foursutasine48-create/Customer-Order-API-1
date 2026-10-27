import { Routes } from '@angular/router';
import { CustomerComponent } from './components/customer/customer.component';
import { OrderComponent } from './components/order/order.component';
import { RiderComponent } from './components/rider/rider.component';
import { RiderJobComponent } from './components/rider-job/rider-job.component';
import { RiderLoginComponent } from './components/rider-login/rider-login.component';

export const routes: Routes = [
  {
    path: 'customers',
    component: CustomerComponent,
  },
  {
    path: 'orders',
    component: OrderComponent,
  },
  {
    path: 'riders',
    component: RiderComponent,
  },
  {
    path: 'rider-login',
    component: RiderLoginComponent,
  },
  {
    path: 'rider-job',
    component: RiderJobComponent,
  },
  {
    path: '',
    redirectTo: 'customers',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'customers',
  },
];