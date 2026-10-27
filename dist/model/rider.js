"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ORDERS_PER_RIDER = exports.AVAILABLE_RIDER_STATUSES = void 0;
exports.validateRider = validateRider;
exports.isAvailableRider = isAvailableRider;
exports.AVAILABLE_RIDER_STATUSES = ["ว่าง", "พร้อมรับงาน"];
exports.MAX_ORDERS_PER_RIDER = 3;
function validateRider(body) {
    if (!body || typeof body !== "object" || Array.isArray(body))
        return "กรุณาระบุข้อมูลไรเดอร์";
    if (typeof body.rider_name !== "string" || !body.rider_name.trim())
        return "กรุณาระบุชื่อไรเดอร์ (rider_name)";
    if (typeof body.phone !== "string" || !/^[0-9\-+ ]{9,20}$/.test(body.phone))
        return "เบอร์โทรไม่ถูกต้อง (phone)";
    if (body.status !== undefined && (typeof body.status !== "string" || !body.status.trim()))
        return "สถานะไม่ถูกต้อง (status)";
    return null;
}
function isAvailableRider(status) {
    return exports.AVAILABLE_RIDER_STATUSES.includes(status);
}
//# sourceMappingURL=rider.js.map