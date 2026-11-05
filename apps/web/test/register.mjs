import { register } from "node:module";

// Seluruh pengujian harus berjalan dalam mode test.
process.env.NODE_ENV = "test";

// Jangan izinkan test menggunakan database dari environment.
delete process.env.DATABASE_URL;

// Tes tidak boleh menandatangani atau menyiapkan transaksi, dan tidak boleh
// bergantung pada jaringan. Swap execution dimatikan; perilaku opt-in diuji
// tersendiri lewat unit test swapExecutionEnabled().
process.env.VETTO_SWAP_EXECUTION = "off";

// Tes memakai satu proxy tepercaya.
process.env.TRUST_PROXY_HOPS = "1";

register("./alias-hooks.mjs", import.meta.url);