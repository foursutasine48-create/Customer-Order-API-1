import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads customers from the configured backend', () => {
    service.getCustomers().subscribe();
    const request = http.expectOne('https://customer-order-api-1-1pkk.onrender.com/customer');
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('creates a rider using the backend field names', () => {
    const rider = { rider_id: 1, rider_name: 'สมชาย ใจดี', phone: '0812345678', status: 'พร้อมรับงาน' };
    service.addRider({ rider_name: rider.rider_name, phone: rider.phone, status: rider.status }).subscribe();
    const request = http.expectOne('https://customer-order-api-1-1pkk.onrender.com/rider');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      rider_name: 'สมชาย ใจดี',
      phone: '0812345678',
      status: 'พร้อมรับงาน'
    });
    request.flush(rider);
  });

  it('assigns the selected orders to a rider', () => {
    service.assignRiderOrders(1, [12, 14, 18]).subscribe();
    const request = http.expectOne('https://customer-order-api-1-1pkk.onrender.com/rider/1/assignments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ order_ids: [12, 14, 18] });
    request.flush({
      plan_id: 1,
      route_id: 1,
      rider_id: 1,
      rider_name: 'สมชาย ใจดี',
      work_no: 'JOB-20261027-A1B2C3',
      route_color: '#2563eb',
      total_distance_km: 3,
      total_time_minutes: 6,
      delivery_cost: 20,
      total_boxes: 3,
      orders: []
    });
  });

  it('looks up a rider job using rider_id and work_no', () => {
    service.lookupRiderJob(1, 'JOB-20261027-A1B2C3').subscribe();
    const request = http.expectOne('https://customer-order-api-1-1pkk.onrender.com/rider/job-lookup');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      rider_id: 1,
      work_no: 'JOB-20261027-A1B2C3'
    });
    request.flush({
      rider_id: 1,
      rider_name: 'สมชาย ใจดี',
      work_no: 'JOB-20261027-A1B2C3',
      route_color: '#2563eb',
      total_distance_km: 3,
      total_time_minutes: 6,
      delivery_cost: 20,
      total_boxes: 3,
      orders: []
    });
  });
});
