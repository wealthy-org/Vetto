# VETTO — status MVP

**Diperbarui:** 5 November 2026
**Diuji pada:** build production lokal + Postgres 17 + RPC Robinhood Chain (chain 4663)
**Ringkas:** inti "intent → quote live → simulasi → review" sudah jalan dan terverifikasi. Yang belum: **penandatanganan transaksi belum menyala** (menunggu satu transaksi nyata bernilai kecil) dan seluruh fitur Phase 3. Approval Permit2 sebagai langkah terpisah sekarang sudah ada (kode + unit test), tinggal diuji dengan wallet berdana.

Legenda:

| Simbol | Arti |
|---|---|
| ✅ | Jalan **dan** sudah diverifikasi (test lulus / dibuktikan ke chain / dicoba live) |
| 🟡 | Kode lengkap & fail-closed, tapi belum diverifikasi end-to-end (butuh env produksi, wallet berdana, atau sign-off) |
| ⛔ | Sengaja tidak tersedia, karena di chain ini tidak ada penyedia yang terverifikasi |
| ❌ | Belum ada |

---

## 1. Sudah jalan ✅

### Chat & intent
| Fitur | Bukti |
|---|---|
| Parser deterministik teks → intent bertipe (swap/inspect/agent-task/klarifikasi) | `packages/intent-parser`, unit test |
| Matematika desimal BigInt, tanpa float | `packages/intent-parser/src/decimal.ts` |
| Ambiguitas → bertanya, tidak menebak kontrak token | `kind: "clarification"` + test |
| Preview "aku baca ini sebagai…" di atas composer, tanpa auto-send | `ChatApp.tsx` |
| Konteks lanjutan (`lastUrl`, `lastPair`, `pendingIntent`) | `ParseContext` |
| Deteksi seed/private key yang diketik → diblokir, tidak dikirim | `packages/safety-policy`, 100 sampel BIP39 |

### Quote & routing
| Fitur | Bukti |
|---|---|
| Quote **live** Uniswap v4 ETH/USDG, 3 pool (0,05% / 0,30% / 1,00%) | V4Quoter `0x8dc1…8F94`, dicocokkan di dua RPC |
| Hanya pool yang benar-benar menjawab yang tampil — tidak ada route fiktif | `skipped` saat gagal quote |
| Ranking berdasarkan jumlah yang benar-benar diterima | `rankQuotes` + test |
| Min-out, slippage, pool fee, price impact, gas, expiry 15 detik | `RouteQuote` → kartu + panel review |
| Quote basi ditolak sebelum submit | fingerprint + expiry |

### Simulasi & safety
| Fitur | Bukti |
|---|---|
| Chain id + hash blok bersama dari dua RPC | `robinhood-v4-simulator.ts` |
| Bytecode PoolManager / Quoter / UniversalRouter / Permit2 / USDG identik di dua RPC | dibandingkan tiap simulasi |
| Quote dua RPC harus sama persis — beda sedikit = batal, bukan dirata-rata | mismatch → abort |
| Cek saldo, allowance Permit2, headroom gas | tampil di panel review |
| `eth_call` atas payload final dari wallet user, `broadcast: false` selalu | server yang membangun calldata |
| Kalau calldata/recipient/spender/jumlah/route berubah → ditolak | `payload_hash` + `quote_fingerprint` (constant-time) |
| Cek link pasif aman dari SSRF (IP desimal, `localhost`, `169.254.169.254`) | `packages/safety-policy` + test |

### Auth & akun
| Fitur | Bukti |
|---|---|
| **Wallet sign-in (SIWE) end-to-end** — challenge → tanda tangan → verifikasi → cookie sesi | diuji 5 Nov 2026: `POST /api/auth/challenge` 200 → `POST /api/auth/verify` 200 → `GET /api/auth/session` 200 → tulis riwayat 200 |
| Challenge sekali pakai, kedaluwarsa 7 menit, hanya hash token yang disimpan, cookie HttpOnly SameSite=Lax | `lib/wallet-auth.ts`, migrasi `0002` |
| Sign-in ≠ izin transaksi | tidak ada jalur tanda tangan transaksi dari sesi |
| Pilihan wallet: Phantom, MetaMask, Rabby, Coinbase Wallet (injected) + WalletConnect | `lib/injected-wallet.ts`, `WalletPicker.tsx` |
| Tampilan wallet + alamat terpangkas `0x…` di header | `AccountMenu.tsx`, `wallet-display.ts` |
| Riwayat prompt per akun, idempotent, bisa dihapus | `/api/history`, migrasi `0003` |

### UI
| Fitur | Bukti |
|---|---|
| Landing + animasi, `/app` 3 kolom, `/docs`, `/sign-in` | `components/*` |
| Deck kartu rute bertumpuk (fan), hover, stagger masuk, badge jujur | `RouteCards.tsx`, lihat `docs/CHAT_UI.md` |
| Karakter SVG dengan pose bersendi (idle/wave/think/point/clasp/live), mata mengikuti kursor | `Banker.tsx` |
| Bubble ucapan + indikator mengetik, satu kartu per pertukaran | `ChatApp.tsx` |
| Bottom sheet review di mobile | `ChatApp.tsx` |
| Label kapabilitas satu sumber (`/api/capabilities`) dipakai landing, docs, dan UI | `packages/quote-engine` |

---

## 2. Kode siap, tapi belum diverifikasi penuh 🟡

| Fitur | Yang kurang |
|---|---|
| Simulasi → persiapan transaksi (`POST /api/execute/prepare`) | kode fail-closed & lengkap; belum pernah dijalankan dengan wallet berdana. Bila allowance kurang, respons jadi `422 APPROVAL_REQUIRED` berisi rencana approval, bukan jalan buntu. |
| Registrasi hash transaksi + receipt (`confirmed`/`reverted` hanya dari chain) | butuh 1 transaksi nyata |
| Riwayat eksekusi (`/api/executions`, `/api/executions/[id]`) | butuh DB + eksekusi nyata |
| Saldo ETH/USDG read-only di dua RPC (`/api/balances`) | butuh pengecekan di deployment |
| Sign-in via WalletConnect | butuh `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (tidak ada di sandbox) |
| Parser LLM opsional | butuh `LLM_API_KEY` |

---

## 3. Belum ada ❌

| Fitur | Alasan |
|---|---|
| **Transaksi swap nyata** | gate terakhir: butuh wallet uji berdana kecil + 1 tx sukses |
| ~~Approval `Permit2` sebagai langkah terpisah~~ → **sudah ada** 🟡 | `lib/permit2-approval.ts` + `POST /api/execute/approve` + panel approval di kartu review: dua tx terpisah (ERC-20 approve ke Permit2, lalu Permit2 approve untuk router) dengan jumlah persis dan masa berlaku 30 hari; swap disiapkan ulang hanya setelah chain melaporkan allowance cukup. Terverifikasi unit test (7 tes calldata), belum dijalankan dengan dana nyata. |
| Delta aset dari trace/state-diff | `eth_call` sukses lebih lemah dari fork + diff; perlu `debug_traceCall`/fork provider |
| Split route multi-pool | butuh router yang terbukti, bukan karangan |
| Intent solver / RFQ | tidak ada counterparty di chain ini |
| Sandbox dApp aktif, burner task, live browser | Phase 3, butuh infra compute terisolasi |
| Email / Google / X sign-in + label custodial | butuh provider eksternal + keputusan custody |
| `apps/api` + `apps/worker` terpisah | masih monolit di route Next |
| CI yang memverifikasi ke chain, audit keamanan independen | belum ada |

## 4. Sengaja tidak tersedia ⛔

| Fitur | Sebab |
|---|---|
| Private submission / relay | tidak ada relay terverifikasi di Robinhood Chain; tombol Private menjelaskan ini dan **menolak**, bukan diam-diam memakai route publik |
| Klaim "aman", "private", "gasless" | tidak ada bukti yang mendukung |

---

## 5. Skor acceptance criteria (brief §16)

| Kriteria | Status |
|---|---|
| 1–4. Intent preview, klarifikasi, kartu quote nyata, bisa menolak tanpa efek samping | ✅ |
| 5. Eksekusi butuh konfirmasi wallet sesuai route yang direview | 🟡 kode siap, belum ada receipt |
| 6. Perubahan payload ditolak | ✅ |
| 7. Simulasi mendeteksi drain token tak terduga | ❌ butuh state diff |
| 8–10. SSRF, penjelasan risiko + cek yang tak tersedia, toggle private jujur | ✅ |
| 11–13. Burner task, takeover, teardown | ⛔ fitur belum ada |
| 14. Unit test intent/precision/slippage/expiry/approval/linking/replay | ✅ |
| 15. Integrasi testnet/fork + mainnet nilai kecil | ❌ bagian mainnet belum |
| 16–18. UI chat/kartu/mobile, error jujur, marketing tanpa klaim palsu | ✅ |

**Inti MVP (1–6, 9–10, 14, 16–18): 13 dari 14 ✅, 1 🟡.**

---

## 6. Cek sendiri dalam 2 menit

```bash
# 1. Siapkan
./scripts/dev-up.sh --no-start     # install + build (idempoten)
./scripts/dev-db.sh                # Postgres lokal + RATE_LIMIT_SALT + migrasi

# 2. Jalankan
./scripts/dev-up.sh

# 3. Buktikan
curl -s localhost:3000/api/capabilities | jq '.capabilities[].status'
curl -s -X POST localhost:3000/api/quotes -H 'content-type: application/json' \
  -H 'origin: http://localhost:3000' \
  -d '{"intent":{"kind":"swap","chainId":4663,"tokenIn":"ETH","tokenOut":"USDG","amountIn":"0.01","slippageBps":50,"privateRequested":false}}' | jq '.routes[] | {provider, minOutBaseUnits, isExecutable}'
```

`isExecutable: false` itu **benar** selama `VETTO_SWAP_EXECUTION` belum dinyalakan.

### Kalau sign-in bilang "temporarily unavailable"

Sejak 5 Nov 2026 setiap 503 membawa `code` + `hint`. Artinya bukan wallet-nya yang salah, tapi setup:

| `code` | Arti | Perbaikan |
|---|---|---|
| `RATE_LIMIT_SALT_MISSING` | salt wajib ≥32 karakter, `change-me` ditolak | `openssl rand -hex 32` → `RATE_LIMIT_SALT=` di `apps/web/.env.local`, restart |
| `SCHEMA_MISSING` | DB tersambung tapi tabel belum ada | `pnpm db:migrate` |
| `DATABASE_MISSING` | nama database di URL tidak ada | buat database-nya, lalu migrasi |
| `DATABASE_REJECTED` | user/password ditolak | periksa `DATABASE_URL` + `?sslmode=` |
| `DATABASE_UNREACHABLE` | tidak ada yang listen | jalankan Postgres / perbaiki host:port |
| `APP_ORIGIN_MISSING` | `next start` di production tanpa `APP_ORIGIN` (loopback dikecualikan) | isi `APP_ORIGIN=https://domain-kamu` |
| `ORIGIN_MISMATCH` | header `Origin` browser beda host dengan deployment (proxy/custom domain/preview) | set `APP_ORIGIN` ke origin https publik; di preview lokal pakai `VETTO_PREVIEW_EMBED=1` |

---

## 7. Blocker berikutnya (urut prioritas)

| Prioritas | Blocker | Yang dibutuhkan | Membuka |
|---|---|---|---|
| P0 | Belum ada transaksi nyata | wallet uji berdana kecil, izin 1 tx | `VETTO_SWAP_EXECUTION=on`; `transaction-prepare` & `execution-history` → ✅ |
| P1 | Delta aset simulasi | `debug_traceCall` atau fork provider | acceptance criterion §16.7 |
| P1 | Identitas USDG | konfirmasi resmi dari issuer | kepastian token yang didukung |
| P2 | Approval Permit2 eksplisit | langkah `approve` terpisah | swap USDG→ETH bisa diselesaikan user |
| P2 | WalletConnect di deployment | project ID + uji wallet target | sign-in tanpa ekstensi |
| P3 | Phase 3 | compute terisolasi | sandbox dApp, burner, live browser |

## 8. Catatan keamanan

- API key RPC yang pernah tertulis di `.env.example` **sudah dihapus dari file**, tapi **masih ada di riwayat git** — rotasi key tersebut.
- Eksekusi default **mati** di production sampai P0 selesai.
- `VETTO_ALLOW_MEMORY_LIMITS=1` dan `VETTO_PREVIEW_EMBED=1` hanya untuk demo lokal/preview. Jangan dipakai di deployment publik.
- Dokumen lain: [MVP_CHECKLIST](./MVP_CHECKLIST.md) (per item, lebih rinci), [PROJECT_STATUS](./PROJECT_STATUS.md), [ROUTING_TRUTH_TABLE](./ROUTING_TRUTH_TABLE.md), [INTEGRATION_MATRIX](./INTEGRATION_MATRIX.md), [CHAT_UI](./CHAT_UI.md).
