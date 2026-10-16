"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ORDER_STATUS = exports.MAX_BOXES_PER_ORDER = void 0;
exports.validateQuantity = validateQuantity;
exports.MAX_BOXES_PER_ORDER = 3;
exports.DEFAULT_ORDER_STATUS = "รอจัดส่ง";
function validateQuantity(q) {
    const n = Number(q);
    if (q === undefined || !Number.isInteger(n) || n < 1 || n > exports.MAX_BOXES_PER_ORDER)
        return `จำนวนกล่อง (box_quantity) ต้องเป็นจำนวนเต็ม 1-${exports.MAX_BOXES_PER_ORDER}`;
    return null;
}
//# sourceMappingURL=order.js.map