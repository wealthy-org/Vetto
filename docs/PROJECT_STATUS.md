# VETTO — Status Proyek dan Pekerjaan Tersisa

**Diperbarui:** 2 November 2026  
**Tujuan:** ringkasan kondisi implementasi dibandingkan [brief utama](../Vettobrief.md).  
**Batas klaim:** status kode tidak berarti integrasi telah dikonfigurasi atau diverifikasi di deployment.

## Ringkasan

VETTO sudah memiliki aplikasi web, UI chat, parser intent, autentikasi wallet EOA, riwayat prompt, pemeriksaan URL pasif, alat verifikasi read-only untuk Robinhood Chain/Uniswap v4, dan test suite.

**MVP transaksi nyata belum siap.** Belum ada quote nyata, simulasi swap yang membandingkan perubahan aset/allowance, pengiriman transaksi dari wallet, atau riwayat receipt. Endpoint persiapan transaksi sengaja gagal tertutup. Jangan memakai aplikasi saat ini untuk mengirim swap.

| Area | Status saat ini |
|---|---|
| Aplikasi, UI, docs, responsif | Ada |
| Parser intent dan preview | Ada; parser LLM opsional |
| Sign-in wallet | Implementasi EOA ada; deployment perlu konfigurasi dan verifikasi |
| Riwayat chat | Ada untuk prompt, bukan transaksi |
| Pemeriksaan link | Ada, pasif saja; tidak membuka situs |
| Verifikasi chain/pool | Skrip read-only ada; tidak membuktikan kelayakan swap |
| Quote transaksi nyata | Belum ada adapter; API mengembalikan tanpa rute |
| Simulasi, execution, receipt | Belum ada |
| Fitur fase lanjut (sandbox, burner, live browser, private relay) | Belum tersedia |

## Yang sudah ada

### Aplikasi dan pengalaman pengguna

- Next.js App Router dengan halaman landing, `/app`, `/docs`, `/sign-in`, dan `/sign-up`.
- UI chat menerima bahasa alami, menampilkan interpretasi intent, klarifikasi, dan konteks percakapan seperti pair terakhir serta intent swap yang tertunda.
- Dukungan LLM OpenAI-compatible bersifat opsional. Hasil LLM tetap divalidasi dengan parser dan registry; LLM tidak memiliki wewenang menandatangani atau mengeksekusi transaksi.
- Logo dan layout responsif sudah terintegrasi.
- Komponen landing memiliki ilustrasi fitur; ilustrasi bukan bukti bahwa fitur tersebut berjalan. Status ketersediaan ditampilkan pada UI.

### API dan backend

| API | Implementasi |
|---|---|
| `POST /api/intent` | Mengurai teks menjadi intent tervalidasi atau meminta klarifikasi; secret wallet ditolak sebelum disimpan |
| `POST /api/quotes` | Validasi intent/pair dan mengumpulkan quote dari adapter terverifikasi; daftar adapter sekarang kosong sehingga tidak ada quote live |
| `POST /api/inspect` | Pemeriksaan URL pasif, kebijakan host, DNS, dan heuristic lookalike; situs tujuan tidak diakses |
| `GET /api/balances` | Endpoint saldo ETH/USDG read-only untuk user terautentikasi; butuh RPC dan alamat USDG yang dikonfigurasi |
| `POST /api/execute/prepare` | Auth, idempotency, dan audit tersedia; respons transaksi dinonaktifkan sampai prasyarat integrasi terpenuhi |
| `GET/POST/DELETE /api/history` | Riwayat prompt per user, retention terbatas, idempotency, dan penghapusan |
| `/api/auth/*` | SIWE EOA challenge/verify/session/logout; sign-in saja, bukan otorisasi transaksi |
| `GET /api/capabilities` | Menyediakan registry status fitur untuk UI/API |

Database menggunakan PostgreSQL dan migrasi berada di `db/migrations`. Rate limiter production membutuhkan database, migrasi, serta konfigurasi salt/proxy sesuai deployment.

### Paket dan perlindungan yang tersedia

- `packages/intent-parser`: parser deterministik, validasi intent, matematika desimal berbasis integer.
- `packages/asset-registry`: satu sumber simbol dan metadata asset; asset ETH/USDG saat ini belum ditandai executable/verified.
- `packages/quote-engine`: tipe quote, filter expiry/kelayakan, ranking net output, serta hanya memanggil adapter berstatus verified.
- `packages/safety-policy`: kebijakan URL/IP, heuristic risiko, dan fungsi evaluasi approval. Evaluasi approval belum terhubung ke jalur eksekusi.
- Middleware dan API memiliki CSP/security headers, pembatasan input, pemeriksaan origin, rate limiting, dan audit. Dukungan production bergantung konfigurasi database/proxy.
- Seed phrase/private key ditolak pada jalur input yang diuji; VETTO tidak meminta secret wallet.

### Verifikasi blockchain

Skrip yang tersedia:

- `pnpm verify:chain`: membandingkan chain ID, bytecode PoolManager/token, serta metadata USDG pada dua RPC di common block.
- `pnpm discover:pools`: mencari event initialize v4 pada rentang blok dan memeriksa state pool.
- `pnpm verify:pool`: membandingkan storage PoolManager dengan StateView.

Semua skrip itu read-only. Pool initialized dan memiliki active liquidity **tidak** membuktikan quote untuk ukuran transaksi, slippage, router calldata, simulasi, atau keamanan transaksi.

## Status integrasi penting

### Swap langsung ETH ↔ USDG

- Quote API belum mempunyai adapter (`ADAPTERS` kosong).
- Registry token tetap fail-closed sampai alamat/identitas token dikonfirmasi melalui sumber tepercaya.
- Feed resmi Uniswap yang diperiksa tidak mencantumkan V4Quoter Robinhood Chain. Alamat Quoter lama yang diperiksa di Blockscout menunjukkan `StubContract.sol`, bukan Quoter.
- File deployment resmi Uniswap mencantumkan Universal Router v2.1.1 untuk Robinhood Chain. Namun, deployment Explorer yang diperiksa hanya menunjukkan partial source match; perilaku dan jalur exact-input v4 masih harus dibuktikan. Jangan gunakan entri v2.1.2 sebelum deployment-nya terverifikasi.
- Belum ada simulasi lengkap, inspeksi spender/calldata/approval, quote fingerprint/revalidation, pengiriman wallet, receipt, atau tabel riwayat transaksi.

**Kesimpulan:** chain dan pool pernah diperiksa secara read-only, tetapi jalur transaksi belum memenuhi acceptance criteria MVP.

## Fitur belum tersedia

| Fitur | Status / catatan |
|---|---|
| Quote live | Belum tersedia; tidak ada adapter terverifikasi |
| Simulasi swap | Belum tersedia sebagai flow aplikasi yang memeriksa asset dan allowance deltas |
| Pemeriksaan approval di jalur transaksi | Policy helper ada, belum dihubungkan ke decoder calldata/permit |
| Eksekusi dari wallet | Belum ada `sendTransaction` untuk swap |
| Receipt dan riwayat transaksi | Belum ada; history saat ini hanya prompt |
| Revalidasi fingerprint quote | Belum ada; perlu menolak perubahan token, jumlah, recipient, spender, calldata, route |
| Email/Google/X sign-in | Belum diimplementasikan; hanya wallet EOA |
| Split route / solver / RFQ | Belum ada venue/counterparty yang diverifikasi |
| Private relay | Tidak tersedia/terverifikasi di Robinhood Chain; tidak boleh dipasarkan sebagai private |
| dApp sandbox aktif | Belum ada isolated worker; pemeriksaan saat ini pasif |
| Burner mint/claim task | Belum ada |
| Isolated live browser dan takeover | Belum ada |
| Uji keamanan independen | Belum dilakukan |

## Langkah menuju MVP transaksi nyata

Kerjakan berurutan; jangan membuka execution hanya karena skrip read-only berhasil.

1. **Verifikasi sumber identitas USDG.** Catat tautan resmi, alamat token, decimals, chain, dan siapa yang mengonfirmasi. Jangan mengandalkan symbol/decimals saja.
2. **Pilih quote path yang benar-benar ada.** Temukan sumber quote (Quoter kontrak yang valid atau mekanisme simulasi yang dapat dibuktikan), ABI/source, alamat deployment, serta hasil konsisten dari dua RPC. Jangan memakai alamat stub.
3. **Buktikan Universal Router v2.1.1 untuk jalur pool yang dipilih.** Cocokkan source/runtime/ABI dan dukungan command v4; uji calldata exact-input pada fork atau `eth_call` state yang sesuai. Jangan kirim transaksi utama untuk tahap ini.
4. **Bangun satu adapter ETH ↔ USDG.** Mulai dari satu pool terverifikasi; quote harus nyata, memiliki expiry/min-out/gas yang masuk akal, dan gagal tertutup jika stale/invalid.
5. **Bangun simulasi dan safety gate.** Periksa dampak saldo, allowance, spender, recipient, amount, min-out, expiry, serta route fingerprint. Reject perubahan apa pun setelah review.
6. **Hubungkan wallet confirmation.** Pastikan transaksi yang dikirim wallet persis sama dengan payload yang direview; jangan pernah menandatangani di server.
7. **Simpan status execution dan receipt.** Tambahkan status pending/confirmed/reverted/expired, transaction hash, block/receipt, explorer link, dan GET per execution; uji idempotency/replay serta isolasi user.
8. **Uji integrasi dengan wallet uji/dana kecil.** Simpan bukti quote, simulasi, approval, dan receipt; baru setelah review keselamatan, ubah capability menjadi verified.

### Yang diperlukan dari pemilik proyek

- Tautan sumber resmi untuk identitas/alamat USDG yang hendak didukung.
- Konfirmasi bahwa target MVP memang satu pool ETH ↔ USDG, tanpa fee protokol VETTO pada tahap awal.
- RPC keys baru setelah key yang pernah dibagikan di percakapan dirotasi. Simpan hanya di `.env.local`/deployment secrets; jangan masukkan ke repo/chat.
- Database production, WalletConnect project ID, `APP_ORIGIN`, rate-limit salt, dan konfigurasi proxy jika autentikasi production hendak diuji.
- Wallet uji dengan saldo kecil untuk uji integrasi setelah seluruh gate lolos.

## Di luar target MVP awal

Menurut [brief](../Vettobrief.md), split routing, solver/RFQ, private relay, dApp sandbox penuh, burner tasks, dan live browser berada di fase berikutnya atau memerlukan provider/infrastruktur yang belum tersedia. Login sosial juga memerlukan provider eksternal dan keputusan custody. Jangan menunda MVP swap dengan membuat mock untuk fitur-fitur tersebut.

## Verifikasi terakhir

Pada perubahan terakhir yang diperiksa:

- `pnpm test`: 111 test lulus di seluruh workspace (termasuk 72 test `apps/web`).
- `pnpm typecheck`: lulus setelah build selesai.
- `pnpm --filter @vetto/web build`: production build lulus.
- Tidak ada transaksi blockchain yang dikirim selama validasi ini.

Jalankan kembali test/typecheck/build setelah perubahan berikutnya; build dan typecheck jangan dijalankan bersamaan karena Next.js menulis `.next/types`.

## Dokumen terkait

- [Brief utama](../Vettobrief.md)
- [Integration matrix](./INTEGRATION_MATRIX.md)
- [Threat model](./THREAT_MODEL.md)
- [README dan panduan verifikasi chain](../README.md)
