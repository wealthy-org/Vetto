import { register } from "node:module";

// Seluruh pengujian harus berjalan dalam mode test.
process.env.NODE_ENV = "test";

// Jangan izinkan test menggunakan database dari environment.
delete process.env.DATABASE_URL;

// Tes memakai satu proxy tepercaya.
process.env.TRUST_PROXY_HOPS = "1";

register("./alias-hooks.mjs", import.meta.url);