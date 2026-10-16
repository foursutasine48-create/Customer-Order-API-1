import { createPool } from 'mysql2/promise';

export const conn = createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false }
});

// import { createPool } from 'mysql2/promise';

// export const conn = createPool({
//     connectionLimit: 10,
//     host: 'mysql-four-3071.g.aivencloud.com',
//     port: 28568,
//     user: 'avnadmin',
//     password: 'AVNS_c4EvfRgPaGt8I7GQOTk',
//     database: 'rider'
// });