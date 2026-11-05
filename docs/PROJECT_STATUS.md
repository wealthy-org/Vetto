# VETTO — Status Proyek dan Pekerjaan Tersisa

**Diperbarui:** 4 November 2026
**Tujuan:** ringkasan kondisi implementasi dibandingkan [brief utama](../Vettobrief.md).
**Batas klaim:** status kode tidak berarti integrasi telah dikonfigurasi atau diverifikasi di deployment.

## Ringkasan

VETTO sekarang punya **quote nyata** dari Uniswap v4 di Robinhood Chain, **simulasi dua RPC**
atas payload yang dibangun server, **jalur review → tanda tangan wallet → receipt** dengan
pencatatan eksekusi, plus fondasi sebelumnya (parser intent, auth wallet, riwayat, cek link pasif).

**Yang belum ada:** transaksi bernilai nyata yang pernah ditandatangani (tidak ada receipt
berbayar), laporan delta aset dari trace/state-diff, private relay, sandbox dApp, burner task,
live browser, dan login sosial. Karena itu **eksekusi tetap opt-in** (`VETTO_SWAP_EXECUTION`)
dan mati secara default di production.

| Area | Status saat ini |
|---|---|
| Aplikasi, UI, docs, responsif | Ada |
| Parser intent dan preview | Ada; parser LLM opsional |
| Sign-in wallet | Implementasi EOA ada; deployment perlu konfigurasi dan verifikasi |
| Riwayat chat | Ada untuk prompt, bukan transaksi |
| Pemeriksaan link | Ada, pasif saja; tidak membuka situs |
| Quote ETH/USDG nyata | **Ada — 3 pool, dua RPC, angka identik** |
| Simulasi pra-tanda tangan | **Ada** (dual-RPC + `eth_call` payload final) |
| Persiapan transaksi + fingerprint | **Ada**, fail-closed, opt-in |
| Eksekusi dari wallet + receipt | **Ada** (kode), belum diuji dengan dana sungguhan |
| Riwayat eksekusi (DB) | **Ada** (migrasi `0004`) |
| Private relay / solver / split / RFQ | Belum tersedia (jujur ditandai) |
| Sandbox dApp, burner task, live browser | Belum tersedia |

Bukti setiap klaim chain ada di [ROUTING_TRUTH_TABLE.md](./ROUTING_TRUTH_TABLE.md).

## Yang sudah ada

### Quote dan routing

- `lib/robinhood-chain.ts` = satu sumber kebenaran: chainId 4663, PoolManager, V4Quoter,
  UniversalRouter, Permit2, USDG, dan registry tiga pool (fee 500 / 3000 / 10000).
- `lib/robinhood-v4-quote-adapter.ts` memanggil `quoteExactInputSingle` per pool lewat
  `eth_call`, memakai angka nyata untuk `expectedOut`, `minOut`, gas, dan
  `priceImpactBps` (dibanding quote referensi 0,1% — bukan angka karangan).
- Route diurutkan berdasarkan jumlah diterima. Pool yang gagal quote dilaporkan `skipped`,
  bukan diisi angka palsu. Tidak ada “1 dari 5 route” fiktif.
- Permintaan private **ditolak**, tidak diganti route publik.

### Simulasi dan gate keamanan

`lib/robinhood-v4-simulator.ts` memeriksa, sebelum apa pun ditawarkan untuk ditandatangani:

1. kedua RPC ada di chain 4663,
2. block bersama punya hash yang sama,
3. bytecode router/quoter/Permit2/USDG identik di kedua RPC,
4. quote dari kedua provider sama persis (jumlah **dan** gas),
5. minimum output yang sudah direview masih tercapai pada quote baru,
6. saldo input, allowance Permit2 (beserta masa berlaku), dan headroom gas,
7. `eth_call` atas payload final dari wallet user.

Semua kegagalan mengembalikan `status: "failed"` dengan alasan eksplisit; `broadcast`
selalu `false`.

### Alur eksekusi

- `POST /api/execute/prepare` — auth + idempotency + audit, membangun payload sendiri
  (browser tidak pernah mengirim calldata/tujuan/jumlah), mencocokkan
  `quoteFingerprint`, menyimpan baris `swap_executions` beserta `payload_hash`.
  Mengembalikan `EXECUTION_DISABLED` bila `VETTO_SWAP_EXECUTION` tidak aktif.
- `POST /api/executions/:id` — mendaftarkan `txHash` hanya jika `payloadHash` cocok.
- `GET /api/executions/:id` — rekonsiliasi receipt; `confirmed`/`reverted` hanya dari
  chain, dan transaksi yang `to`/`input`/`value`-nya tidak sama dengan payload yang
  direview dicatat sebagai `reverted` dengan penjelasan.
- `GET /api/executions` — riwayat untuk panel kiri UI.

### UI

- Panel review: daftar route nyata (bisa dipilih), jumlah diterima/minimum, venue, biaya
  jaringan, estimasi gas, price impact, masa berlaku quote.
- Tombol “Simulate and review” → ringkasan hasil simulasi (minimum output baru, tujuan,
  scope approval, payload hash) → checkbox konfirmasi eksplisit → tanda tangan wallet →
  status transaksi + link explorer.
- Rail kiri menampilkan transaksi beserta status dari receipt.

### API lain

`POST /api/intent`, `POST /api/inspect`, `GET /api/balances`, `GET/POST/DELETE /api/history`,
`/api/auth/*`, `GET /api/capabilities` seperti sebelumnya.

## Konfigurasi yang dibutuhkan

| Variabel | Untuk apa |
|---|---|
| `DATABASE_URL` | migrasi `0001`–`0004`, sesi, riwayat, eksekusi, rate limit Postgres |
| `RATE_LIMIT_SALT` (≥32 karakter) | rate limit production |
| `TRUST_PROXY_HOPS` | hitungan proxy di depan app |
| `APP_ORIGIN` | pengecekan origin absolut (opsional di local/preview) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | sign-in WalletConnect |
| `VETTO_SWAP_EXECUTION=on` | **membuka penandatanganan transaksi** (default mati di production) |
| `ROBINHOOD_RPC_URL_PRIMARY` / `_SECONDARY` | opsional; default memakai endpoint publik + provider independen |

## Langkah berikutnya (urut)

1. **Uji receipt bernilai kecil** dengan wallet berisi sedikit ETH di Robinhood Chain;
   simpan tx hash + receipt sebagai bukti, lalu set `VETTO_SWAP_EXECUTION=on`.
2. **Delta aset dari trace** (`debug_traceCall`/state diff) supaya simulasi melaporkan
   perubahan saldo dan allowance, bukan hanya “call berhasil”.
3. **Approval flow USDG→ETH**: tambahkan `approve(Permit2)` dengan jumlah terbatas sebagai
   langkah terpisah yang ikut direview (saat ini swap USDG ditolak bila allowance kurang).
4. **Sign-in lewat injected wallet** (tanpa WalletConnect project ID) untuk deployment
   internal, lalu login email/Google/X dengan label custodial yang jelas.
5. **Pemeriksaan alamat USDG** dari sumber resmi (issuer) — metadata on-chain saja bukan bukti
   status resmi.
6. Private relay, sandbox dApp, burner task, live browser: tetap fase berikutnya dan tetap
   ditandai `planned` sampai ada provider nyata.

### Yang diperlukan dari pemilik proyek

- Konfirmasi resmi alamat/identitas USDG.
- Wallet uji berdana kecil + izin untuk satu transaksi percobaan (untuk membuka eksekusi).
- Database Postgres (Neon) + `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` + `APP_ORIGIN` +
  `RATE_LIMIT_SALT` + `TRUST_PROXY_HOPS` untuk deployment.
- RPC key milik sendiri bila kuota endpoint publik tidak mencukupi. **Key yang pernah
  tertulis di `.env.example` sudah dihapus dari repo — rotasi key tersebut.**

## Verifikasi terakhir

- `pnpm test`: **110 test lulus** (workspace), termasuk fingerprint, transisi status
  eksekusi, gating `swapExecutionEnabled`, registry venue, dan API.
- `pnpm --filter @vetto/web typecheck`: lulus.
- `pnpm --filter @vetto/web build`: lulus.
- `POST /api/quotes` dijalankan live: 3 route executable, mis. 0,01 ETH → 24,339,199 /
  24,254,227 / 23,876,019 USDG (6 desimal) dengan min-out dan gas dari quoter.
- Tidak ada transaksi blockchain yang dikirim selama validasi ini.

## Dokumen terkait

- [Brief utama](../Vettobrief.md)
- [Routing truth table](./ROUTING_TRUTH_TABLE.md)
- [Integration matrix](./INTEGRATION_MATRIX.md)
- [Threat model](./THREAT_MODEL.md)
- [README](../README.md)
