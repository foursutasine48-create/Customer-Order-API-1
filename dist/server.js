"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
// ใช้ PORT ตัวพิมพ์ใหญ่ตามมาตรฐานสากล (เพราะพวกบริการโฮสติ้ง เช่น Render จะส่งค่ามาเป็นตัวพิมพ์ใหญ่เท่านั้น)
const port = process.env.PORT || 3000;
const server = http_1.default.createServer(app_1.app);
server.listen(port, () => {
    console.log(`Server is started on port ${port}`);
})
    .on("error", (error) => {
    console.error(error);
});
//# sourceMappingURL=server.js.map