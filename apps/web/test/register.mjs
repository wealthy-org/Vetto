import { register } from "node:module";
// Tes memakai header x-forwarded-for sebagai identitas klien → anggap 1 proxy tepercaya (lihat clientKey di lib/http.ts).
process.env.TRUST_PROXY_HOPS ??= "1";
register("./alias-hooks.mjs", import.meta.url);