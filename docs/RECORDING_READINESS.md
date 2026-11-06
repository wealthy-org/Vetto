# Kesiapan Rekaman — Klip 5 & Klip 8

Diperiksa: 2026-11-06, build `adc55e5`, dev server lokal (`http://127.0.0.1:3000`, Postgres jalan, rantai 4663 lewat `.env.local`).
Tujuan: jawab satu pertanyaan per klip — **sudah bisa direkam atau belum**, dengan bukti yang bisa diulang.

| Klip | Isi | Status | Alasan singkat |
|---|---|---|---|
| **5** | Kejujuran sistem: mint NFT ditandai **Planned** | ✅ **SIAP direkam sekarang** | Flow lengkap berjalan hari ini, tanpa data palsu |
| **8** | Swap sungguhan + status **confirmed** dari receipt chain | ⛔ **BELUM bisa direkam** | Butuh wallet berdana + `VETTO_SWAP_EXECUTION=on` + receipt test |

Label kapabilitas tidak diubah oleh dokumen ini: `agent-tasks` tetap **planned**, `transaction-prepare` & `execution-history` tetap **planned**.

Bukti layar (dari uji hari ini):
- `docs/assets/recording-klip5-planned.png` — kartu `Capability: Burner mint / claim tasks — Planned` di panel kanan.
- `docs/assets/recording-klip8-disabled.png` — tombol `Simulate & review — unavailable` + catatan gate.

---

## Klip 5 — Kejujuran Sistem ✅ READY

### Yang benar-benar terjadi (hasil uji hari ini)

1. Chip `Mint the NFT at nft-mint-pass.app max 0.01 ETH` ada di baris saran chat (`ChatApp.tsx`, `SUGGESTIONS`).
2. Klik chip → prompt masuk ke composer + baris `I read this as: Mint on nft-mint-pass.app · burner wallet · max 0.01 ETH`.
3. Kirim → **hanya satu** panggilan jaringan: `POST /api/intent`. Tidak ada `/api/quotes`, tidak ada `/api/execute/*`, tidak ada transaksi, tidak ada permintaan tanda tangan.
4. Balasan Vetto (persis seperti di layar):

   | Bagian | Teks |
   |---|---|
   | Gelembung karakter | “I can quote live swaps and check links before you connect.” |
   | Kartu kiri | `Here's how I read that.` → `Mint on nft-mint-pass.app · burner wallet · max 0.01 ETH` |
   | Chip status | **Planned** |
   | Catatan | `Burner mint / claim tasks: Heavily restricted; Phase 3. Nothing was started.` |
   | Panel kanan (zoom target) | `Capability` / **Burner mint / claim tasks** / chip **Planned** / `Heavily restricted; Phase 3.` |

5. Server juga menolak task tanpa batas belanja: `Mint the NFT at nft-mint-pass.app` (tanpa `max 0.01 ETH`) → `clarification`, bukan agent-task. Ini bonus jujur kalau mau ditambahkan ke klip.

### Catatan untuk perekam (penting)

- **Chip hanya mengisi composer, tidak auto-send.** Harus klik tombol panah (→) / Enter satu kali. Kalau klip hanya meng-klik chip, layar cuma menampilkan prompt dan tidak ada kartu `Capability`.
- Zoom target ada di **kolom kanan** (panel), bukan di kolom chat. Koordinat panel di 1440×900: `x≈1189, y≈70`.
- Waktu respons nyata ≈ 300–900 ms; jeda 1 dtk sebelum zoom cukup. Total 6–8 dtk realistis.
- Baris `Nothing was started.` muncul **hanya** di kartu chat; panel kanan tidak memuatnya. Kalau caption ingin "No fake buttons", ambil zoom yang mencakup kartu chat, atau potong ke dua titik.
- Tidak ada tombol aktif yang bisa diklik untuk "lanjut mint" di mana pun — memang tidak ada, jadi klip tidak bisa tanpa sengaja menyesatkan.

### Caption — sesuai dengan bukti

> “If it isn't real yet, Vetto says so. No fake buttons.”

Cocok: labelnya `Planned`, alasannya tertulis `Heavily restricted; Phase 3`, dan kalimat penutupnya `Nothing was started.` Jangan menambahkan klaim "Vetto akan melakukannya nanti" — sistem tidak menjanjikan itu.

---

## Klip 8 — Swap sungguhan + receipt ⛔ BLOCKED

### Bukti apa yang terjadi hari ini

| Langkah | Hasil |
|---|---|
| `POST /api/quotes` `0.01 ETH → USDG` | **200**, 3 rute nyata dari pool v4 (0.05% / 0.30% / 1%), best output `22.271883 USDG`, min-out `22.160523` @0.5% |
| Panel Route review | terisi lengkap: pool fee, price impact, gas `0.000000087 ETH`, jaringan `Robinhood Chain · 4663` |
| Tombol aksi | **`Simulate & review — unavailable` (disabled)** |
| Catatan di bawah tombol | “Quotes are live, but this deployment does not submit transactions: simulation and signing stay off until the operator enables `VETTO_SWAP_EXECUTION` after a small-value receipt test. Nothing was sent, and no approval was requested.” |
| Panel Transactions | “Nothing is listed until a wallet has signed it.” |

Jadi **tidak ada** tanda tangan, tidak ada tx hash, tidak ada status `confirmed` yang bisa difilmkan saat ini.

### Empat penghalang (semua harus beres)

| # | Penghalang | Kondisi sekarang | Yang dibutuhkan |
|---|---|---|---|
| 1 | Wallet asli di browser | Sandbox/headless tanpa ekstensi; sign-in SIWE butuh tanda tangan | Browser desktop dengan Rabby/MetaMask/Phantom, wallet terhubung, sign-in lolos |
| 2 | Dana kecil di rantai 4663 | Tidak ada wallet berdana | Wallet uji berisi sedikit ETH (gas) + USDG, nominal swap ±0.01 |
| 3 | Gate eksekusi | `VETTO_SWAP_EXECUTION` tidak diset; default mati di production | Nyalakan per deployment **setelah** receipt test lolos |
| 4 | Jejak receipt | Kode jalur receipt ada (`lib/execution-receipts.ts`, status hanya jadi `confirmed` bila `eth_getTransactionReceipt` → `success`), tapi belum pernah dijalankan dengan tx nyata | 1 tx sukses nyata → baru `transaction-prepare` & `execution-history` boleh naik ke verified |

### Yang sudah siap di kode (tapi belum terbukti di rantai)

- `POST /api/execute/prepare` — membangun ulang payload, mencocokkan fingerprint review, cek ulang minimum vs quote baru, simulasi, simpan record (butuh `Idempotency-Key` UUID; membalas `EXECUTION_DISABLED` selama gate mati).
- `POST /api/execute/approve` — jalur approval Permit2 terpisah, sudah diuji 400/401/200.
- `lib/execution-receipts.ts` — satu-satunya yang boleh memindahkan status ke `confirmed`/`reverted`, sumbernya receipt chain, bukan app.
- Link explorer: `https://robinhoodchain.blockscout.com/tx/<hash>` (`explorerLink()`).

Semua itu **belum** boleh diklaim verified dan **belum** ada di capabilities (tetap `planned`).

### Skrip rekaman setelah keempat penghalang beres

1. Connect wallet → sign-in → mendarat di `/app`.
2. Minta nominal kecil (mis. `Swap 0.01 ETH to USDG`) → tunggu rute live muncul.
3. Jika allowance USDG kurang: selesaikan **langkah approval Permit2 terpisah** dulu (Vetto menolak lanjut kalau allowance kurang — ini perilaku benar, jangan dipotong jadi "gagal").
4. `Simulate & review` → cek nominal, router, scope approval → centang → `Execute swap` → tanda tangan di wallet.
5. Zoom ke panel **Transactions**: status `prepared → submitted → confirmed`.
6. Buka tx di Blockscout, tunjukkan **Success**. Zoom out.
7. Simpan tx hash di catatan rilis; baru setelah itu nyalakan `VETTO_SWAP_EXECUTION=on` di production dan ubah label capability ke verified.

Durasi 12–15 dtk realistis, tapi **butuh take berulang** karena waktu konfirmasi blok tidak bisa diprediksi.

---

## Ringkasan untuk tim rekaman

| | Klip 5 | Klip 8 |
|---|---|---|
| Bisa direkam hari ini | ✅ | ⛔ |
| Perlu dana | tidak | ya (±0.01 swap + gas) |
| Perlu ubah konfigurasi | tidak | ya (`VETTO_SWAP_EXECUTION=on`) |
| Perlu wallet ekstensi | tidak | ya |
| Risiko klaim palsu | tidak ada | n/a (belum direkam) |
| Durasi target | 6–8 dtk, tercapai | 12–15 dtk, setelah dibuka |


---

## Biaya on-chain di Robinhood Chain (mainnet, 4663)

Dibaca langsung dari RPC mainnet pada 2026-11-06 (block `107,742,138`):

| Bacaan | Nilai |
|---|---|
| `eth_gasPrice` | `20,522,000 wei` = **0.0205 gwei** |
| `baseFeePerGas` block terakhir | `20,732,000 wei` = 0.0207 gwei |
| Gas 1 swap v4 (dari quote nyata) | 42,397 |
| Gas approve ERC-20 / Permit2 | ±46,000 |
| Gas deploy kontrak (bukan bagian VETTO) | 1–3 juta |

Perhitungan biaya pada 0.0205 gwei (ETH ≈ $2,229 pada hari yang sama):

| Aksi | Gas | ETH | USD |
|---|---|---|---|
| 1 swap v4 | 42,397 | 0.00000087 | ~$0.002 |
| 1 approve Permit2 | 46,000 | 0.00000094 | ~$0.002 |
| Approve + swap (Klip 8) | ~88,000 | 0.0000018 | **~$0.004** |
| Deploy kontrak 1 juta gas | 1,000,000 | 0.000021 | ~$0.05 |
| Deploy kontrak 3 juta gas | 3,000,000 | 0.000062 | ~$0.14 |

Catatan penting:

- **VETTO tidak punya kontrak sendiri.** Repo ini nol file Solidity; yang dipakai adalah kontrak yang sudah ter-deploy di 4663 (UniversalRouter, Permit2, USDG, V4Quoter, PoolManager). Jadi "deploy ke mainnet" untuk VETTO = deploy aplikasi Next.js (hosting, bukan gas), **bukan** transaksi kontrak.
- Yang perlu ETH hanya wallet pengguna untuk gas. Praktis: kirim **±0.015–0.02 ETH di chain 4663** → cukup untuk swap uji 0.01 ETH + puluhan ribu transaksi gas, dan tetap ada sisa untuk jaga-jaga kalau gas naik.
- Gas sempat tercatat 0.23–0.37 gwei pada hari lain (Agustus–September 2026). Bahkan di 0.37 gwei, satu swap tetap < $0.05 dan deploy 3 juta gas ≈ 0.0011 ETH (~$2.5). Jadi gas bukan penghalang; yang jadi penghalang Klip 8 tetap izin/gate, bukan biaya.
- ETH harus ETH **di chain 4663**, bukan ETH mainnet Ethereum. Butuh bridge dulu, dan biaya bridge biasanya jauh lebih besar dari total gas di atas.
