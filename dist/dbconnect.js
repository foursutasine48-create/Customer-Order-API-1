"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conn = void 0;
const promise_1 = require("mysql2/promise");
exports.conn = (0, promise_1.createPool)({
    connectionLimit: 10,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});
//# sourceMappingURL=dbconnect.js.map