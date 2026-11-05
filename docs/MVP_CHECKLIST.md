# VETTO — Checklist MVP

**Diperbarui:** 4 November 2026 · **Commit:** `97e650a`
**Dasar penilaian:** [brief](../Vettobrief.md) §16 (acceptance criteria), §20 (urutan build), [ROUTING_TRUTH_TABLE](./ROUTING_TRUTH_TABLE.md)

Legenda:

| Simbol | Arti |
|---|---|
| ✅ | Selesai **dan** diverifikasi (test lulus / dibuktikan ke chain / dijalankan live) |
| 🟡 | Kode ada dan fail-closed, tapi **belum diverifikasi end-to-end** (butuh env, wallet berdana, atau sign-off pemilik) |
| ❌ | Belum ada |
| ⛔ | Sengaja tidak tersedia (tidak ada provider nyata di chain ini) |

---

## 1. Fondasi & UI (brief §4, §20 langkah 1)

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 1.1 | Shell Next.js + branding asli VETTO | ✅ | `apps/web/app/*`, landing/`/app`/`/docs`/`/sign-in` |
| 1.2 | Layout 3 kolom (rail kiri, chat, panel review) + bottom sheet mobile | ✅ | `components/ChatApp.tsx` |
| 1.3 | Intent preview di atas composer | ✅ | `parseIntent` di sisi klien, tanpa auto-send |
| 1.4 | Landing page + animasi + status kapabilitas live dari registry | ✅ | `components/landing/*` membaca `CAPABILITIES` |
| 1.5 | Docs in-app (`/docs`, `/docs/[slug]`) | ✅ | `lib/docs-content.ts` sudah disinkronkan |
| 1.6 | Panel review swap (route picker, biaya, gas, expiry) | ✅ | `components/SwapReview.tsx` |
| 1.7 | Daftar transaksi di rail kiri + link explorer | ✅ | `TransactionsList`, `GET /api/executions` |
| 1.8 | Error state yang tidak mengklaim aksi berhasil | ✅ | test `lib/audit.test.ts`, `test/api.test.ts` |
| 1.9 | Toggle "Private" nonaktif dengan copy jujur | ✅ | tombol `aria-disabled`, quote private ditolak |

## 2. Auth & wallet (brief §11, §16.12)

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 2.1 | SIWE EOA sign-in (chain 4663), challenge sekali pakai, cookie HttpOnly | ✅ | diverifikasi 5 Nov 2026: challenge → tanda tangan EOA → verify → session → tulis riwayat, semua 200 (lihat `docs/MVP_STATUS.md` §1) |
| 2.2 | Sign-in ≠ izin transaksi (dipisah tegas) | ✅ | pesan SIWE menyatakan eksplisit; tidak ada jalur sign dari sesi |
| 2.3 | Wallet link aman (tanpa identity swap) | 🟡 | tabel `wallet_identities` + unique constraint; belum diuji dengan provider nyata |
| 2.4 | Sign-in via injected wallet (EIP-1193 langsung) | ✅ | Phantom, MetaMask, Rabby, Coinbase Wallet lewat `lib/injected-wallet.ts`; WalletConnect butuh project ID |
| 2.5 | Email / Google / X sign-in + label custodial | ❌ | butuh provider eksternal + keputusan custody |
| 2.6 | Tidak pernah meminta seed/private key | ✅ | `lib/secret-guard.ts` + test BIP39 (100 sampel) |

## 3. Intent engine (brief §5)

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 3.1 | Parser deterministik → intent bertipe + validasi skema | ✅ | `packages/intent-parser`, test |
| 3.2 | Klarifikasi saat ambigu, tidak menebak kontrak token | ✅ | `kind: "clarification"` + test |
| 3.3 | Matematika desimal BigInt (tanpa float) | ✅ | `decimal.ts`, `parseDecimal` |
| 3.4 | LLM parser opsional, tetap tunduk validasi & registry | 🟡 | kode ada; butuh `LLM_API_KEY` untuk uji live |
| 3.5 | Konteks percakapan (`lastUrl`, `lastPair`, `pendingIntent`) | ✅ | `ParseContext` di `ChatApp` |
| 3.6 | Prompt injection dari halaman dApp tidak bisa memberi otoritas | ✅ | by design: LLM tidak pernah memilih kontrak/jumlah eksekusi |

## 4. Quote & routing (brief §6, §16.1–§16.3, §16.10)

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 4.1 | Quote nyata Uniswap v4 (3 pool ETH/USDG) | ✅ | dua RPC, angka + gas identik di blok `106043957` |
| 4.2 | Hanya route yang benar-benar executable yang ditampilkan | ✅ | pool gagal quote → `skipped`, tidak diisi angka |
| 4.3 | Tidak ada daftar "1 dari 5 route" fiktif | ✅ | 1–3 route sesuai kenyataan |
| 4.4 | Ranking berdasarkan jumlah diterima | ✅ | `rankQuotes` + test |
| 4.5 | Min-out, fee, gas, price impact, expiry tampil di kartu | ✅ | `SwapReview` + `RouteQuote` |
| 4.6 | Slippage bisa diatur (default 0,5%) | ✅ | `slippageBps`, clamp 0–9999 |
| 4.7 | Revalidasi quote basi sebelum submit | ✅ | expiry 15s + quote baru + cek ulang min-out |
| 4.8 | Split route | ❌ | butuh router multi-pool yang terbukti |
| 4.9 | Intent solver / RFQ | ❌ | tidak ada counterparty |
| 4.10 | Private submission | ⛔ | tidak ada relay terverifikasi; UI menolak, tidak mengganti ke route publik |

## 5. Simulasi & safety gate (brief §8, §16.6–§16.7)

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 5.1 | Dual-RPC: chain id + hash blok bersama | ✅ | `robinhood-v4-simulator.ts` |
| 5.2 | Bytecode router/quoter/Permit2/USDG identik di dua RPC | ✅ | 4 kontrak dibandingkan per simulasi |
| 5.3 | Quote dua provider harus sama persis (jumlah + gas) | ✅ | mismatch → abort, bukan dirata-rata |
| 5.4 | Cek saldo, allowance Permit2 + masa berlaku, headroom gas | ✅ | hasilnya ditampilkan di panel review |
| 5.5 | `eth_call` atas payload final dari wallet user | ✅ | `broadcast: false` selalu |
| 5.6 | Server membangun sendiri calldata (browser tidak pernah kirim) | ✅ | `execute/prepare` mengabaikan calldata kiriman klien |
| 5.7 | Deteksi perubahan calldata/recipient/spender/jumlah/route | ✅ | `payload_hash` + `quote_fingerprint` (constant-time compare) |
| 5.8 | **Delta aset dari trace/state-diff** (deteksi drain tak terduga) | ❌ | keterbatasan yang diakui; `eth_call` sukses lebih lemah dari fork+diff |
| 5.9 | Pemeriksaan spender/approval unlimited di jalur transaksi | 🟡 | policy `packages/safety-policy` ada, belum dipakai untuk decode calldata router |
| 5.10 | SSRF / redirect privat saat inspect URL | ✅ | `packages/safety-policy` + test (`169.254.169.254`, `localhost`, desimal IP) |

## 6. Eksekusi & receipt (brief §15, §16.5, §16.11, §16.17)

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 6.1 | Konfirmasi eksplisit sebelum tanda tangan (checkbox + wallet prompt) | ✅ | `SwapReview`: tombol baru aktif setelah konfirmasi |
| 6.2 | Wallet menandatangani payload yang identik dengan yang direview | ✅ | hash payload dikembalikan & dicocokkan saat registrasi |
| 6.3 | Status `confirmed`/`reverted` hanya dari receipt chain | ✅ | `execution-receipts.ts` + `nextStatus` (unit test) |
| 6.4 | Tx yang `to`/`input`/`value`-nya beda dari payload → ditolak | ✅ | dicatat `reverted` + alasan |
| 6.5 | Riwayat eksekusi per user + link explorer | 🟡 | migrasi `0004` + `GET /api/executions`; butuh DB |
| 6.6 | Idempotency + audit fail-closed pada prepare | ✅ | test `execute prepare: audit failure rolls back` |
| 6.7 | Rate limit per klien | ✅ | Postgres di production, memory di dev (tidak ada fallback diam-diam) |
| 6.8 | **Transaksi nyata bernilai kecil + receipt tersimpan** | ❌ | **gate terakhir sebelum `VETTO_SWAP_EXECUTION=on`** |
| 6.9 | Langkah `approve(Permit2)` terpisah untuk USDG→ETH | ❌ | sekarang swap USDG ditolak bila allowance kurang (jujur, belum bisa lanjut) |
| 6.10 | Saldo & balance wallet di UI | 🟡 | `GET /api/balances` ada; butuh RPC + DB |

## 7. Pemeriksaan dApp & fitur Phase 3 (brief §8–§10)

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 7.1 | Cek link pasif (skema, host, DNS, punycode, lookalike) | ✅ | `POST /api/inspect`, laporan + "insufficient evidence" |
| 7.2 | Skor risiko dengan bukti & batasan | ✅ | band `low concern`/`caution`/`dangerous`/`insufficient evidence` |
| 7.3 | Sandbox dApp aktif (VM/container + wallet uji) | ❌ | Phase 3, butuh infra |
| 7.4 | Agent task mint/claim dengan burner | ❌ | Phase 3 |
| 7.5 | Live browser + takeover + wipe | ❌ | Phase 3 |

## 8. Engineering health

| # | Item | Status | Bukti / catatan |
|---|---|---|---|
| 8.1 | Unit test inten/precision/slippage/expiry/approval/replay | ✅ | **118 test lulus** (`pnpm test`) |
| 8.2 | Test fingerprint, transisi status, gating eksekusi, registry venue | ✅ | `lib/quote-fingerprint.test.ts` |
| 8.3 | `typecheck` + production `build` | ✅ | keduanya lulus (jangan dijalankan bersamaan) |
| 8.4 | Registry kapabilitas satu sumber (`/api/capabilities`) | ✅ | dipakai landing, docs, UI |
| 8.5 | Dokumen: truth table, integration matrix, threat model, status | ✅ | `docs/*` |
| 8.6 | Uji integrasi testnet/fork otomatis (CI ke chain) | ❌ | verifikasi masih manual/ad-hoc |
| 8.7 | Uji keamanan independen / audit | ❌ | wajib sebelum rilis publik |
| 8.8 | `apps/api` + `apps/worker` (pg-boss) dipisah | ❌ | masih monolit di route Next |

---

## Peta ke acceptance criteria brief §16

| # | Kriteria | Status |
|---|---|---|
| 1 | Intent preview menampilkan aset, chain, jumlah, aksi sebelum quote | ✅ |
| 2 | Aset tak dikenal → klarifikasi, tidak menebak kontrak | ✅ |
| 3 | Kartu quote berisi route nyata, min-out, gas/slippage, expiry | ✅ |
| 4 | User bisa menolak tanpa efek samping | ✅ |
| 5 | Eksekusi butuh konfirmasi wallet, sesuai route yang direview | 🟡 (kode siap, belum ada receipt berdana) |
| 6 | Perubahan calldata/recipient/spender/jumlah/route ditolak | ✅ |
| 7 | Simulasi mendeteksi drain token tak terduga | ❌ (butuh state diff) |
| 8 | Inspeksi situs aman dari SSRF/redirect jaringan internal | ✅ |
| 9 | Penjelasan risiko menyertakan bukti + mengakui cek yang tak tersedia | ✅ |
| 10 | Toggle private nonaktif bila tak ada relay + disclosure publik | ✅ |
| 11 | Task burner tak bisa melampaui budget/kontrak target | ⛔ (fitur belum ada) |
| 12 | Takeover hanya untuk pemilik sesi, kedaluwarsa bersama browser | ⛔ |
| 13 | Exit/teardown membatalkan stream, token kontrol, key uji | ⛔ |
| 14 | Unit test intent/precision/slippage/expiry/approval/linking/replay | ✅ |
| 15 | Integrasi testnet/fork lalu validasi mainnet nilai kecil | ❌ (bagian mainnet belum) |
| 16 | UI chat, kartu, review kontekstual, history, transisi mobile | ✅ |
| 17 | Pesan error tidak mengklaim aksi yang gagal/disimulasi | ✅ |
| 18 | Marketing tidak klaim private/safe/gasless tanpa bukti | ✅ |

**Skor MVP inti (kriteria 1–6, 9–10, 14, 16–18):** 12 dari 13 ✅, sisa 1 🟡 (butuh receipt nyata).

---

## Blocker → aksi berikutnya

| Prioritas | Blocker | Yang dibutuhkan | Membuka apa |
|---|---|---|---|
| P0 | Belum ada transaksi bernilai nyata | wallet uji berdana kecil + izin 1 tx | `VETTO_SWAP_EXECUTION=on`, status `transaction-prepare` & `execution-history` → verified |
| P0 | `DATABASE_URL`, WC project ID, `RATE_LIMIT_SALT`, `TRUST_PROXY_HOPS` | env deployment | sign-in, riwayat, eksekusi, rate limit nyata |
| P1 | Identitas USDG | konfirmasi resmi issuer | kepastian token yang didukung |
| P1 | Delta aset simulasi | `debug_traceCall` / fork provider | acceptance criterion §16.7 |
| P2 | Approval Permit2 eksplisit | langkah `approve` terpisah | swap USDG→ETH bisa dilanjutkan user |
| P2 | Sign-in injected wallet | EIP-1193 + nonce server | demo tanpa WalletConnect |
| P3 | Phase 3 (sandbox, burner, live browser) | infra isolated compute | fitur lanjutan |

## Catatan keamanan

- API key RPC yang pernah tertulis di `.env.example` **sudah dihapus** dari file, tetapi masih ada di riwayat git — **rotasi key tersebut**.
- Eksekusi default **mati** di production sampai P0 pertama selesai.
