import { Routes } from '@angular/router';
import { CustomerComponent } from './components/customer/customer.component';
import { OrderComponent } from './components/order/order.component';
import { RoutePlanningComponent } from './components/route-planning/route-planning.component';
import { RiderMapComponent } from './components/rider-map/rider-map.component';

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
    path: 'route-planning',
    component: RoutePlanningComponent,
  },
  {
    path: 'rider-map',
    component: RiderMapComponent,
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