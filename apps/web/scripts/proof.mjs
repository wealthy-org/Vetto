#!/usr/bin/env node
/**
 * VETTO proof · pintu masuk lintas-platform (Windows / macOS / Linux).
 *
 * Versi bash (scripts/proof.sh) hanya jalan di bash. Ini versi Node murni, jadi
 * bisa dipanggil dari PowerShell maupun cmd:
 *
 *   node scripts/proof.mjs                bukti mainnet, 0.0005 ETH
 *   node scripts/proof.mjs 0.001          ukuran lain
 *   node scripts/proof.mjs --json         findings JSON
 *   node scripts/proof.mjs --tx 0x…       periksa transaksi lain
 *   node scripts/proof.mjs quote 0.0005   quote live tiga pool
 *   node scripts/proof.mjs check          verify-chain + quote dua RPC (butuh .env.local)
 *   node scripts/proof.mjs record         rekam ANSI, render MP4 bila python siap
 *   node scripts/proof.mjs install        pasang dependency
 *   node scripts/proof.mjs doctor         cek node, dependency, python
 *
 * Semua read-only: tidak ada tanda tangan atau pengiriman transaksi.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const WEB = join(REPO, "apps", "web");
const PROOF = join(WEB, "scripts", "mainnet-proof.mjs");
const PROOF_DIR = join(REPO, "docs", "proof");
const CAPTURE = join(PROOF_DIR, "run.ansi");
const FINDINGS = join(PROOF_DIR, "run.json");
const RENDER = join(PROOF_DIR, "render_video.py");

const WIN = process.platform === "win32";
const NPM = WIN ? "npm.cmd" : "npm";
const NPX = WIN ? "npx.cmd" : "npx";
const PY_CANDIDATES = WIN ? ["python", "py", "python3"] : ["python3", "python"];

const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (colour ? `\u001B[${code}m${text}\u001B[0m` : String(text));
const bold = paint("1");
const dim = paint("2");
const green = paint("32");
const yellow = paint("33");
const red = paint("31");

const out = (...a) => process.stdout.write(`${a.join(" ")}\n`);
const ok = (m) => process.stderr.write(`  ${green("✓")} ${m}\n`);
const warn = (m) => process.stderr.write(`  ${yellow("!")} ${m}\n`);
const info = (m) => process.stderr.write(`  ${dim("·")} ${m}\n`);

function die(message, code = 2) {
  process.stderr.write(`\n  ${red("✗")} ${message}\n\n`);
  process.exit(code);
}

// ---------------------------------------------------------------- prasyarat

function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

function haveDeps() {
  return existsSync(join(WEB, "node_modules", "viem"));
}

/** Pasang Pillow + imageio-ffmpeg sekali, supaya `record` langsung jalan. */
function installPythonDeps() {
  const base = findPythonBinary();
  if (!base) return null;
  info(`memasang Pillow + imageio-ffmpeg lewat ${base} (sekali saja)`);
  spawnSync(base, ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "pillow", "imageio-ffmpeg"], {
    stdio: "ignore",
  });
  return findPython();
}

function findPythonBinary() {
  for (const candidate of PY_CANDIDATES) {
    const probe = spawnSync(candidate, ["-c", "import sys"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function findPython() {
  for (const candidate of PY_CANDIDATES) {
    const probe = spawnSync(candidate, ["-c", "import PIL, imageio_ffmpeg"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: "inherit", cwd: options.cwd ?? REPO, shell: false });
}

/** Jalankan perintah lewat node, teruskan exit code. */
function runNode(scriptPath, args, cwd) {
  const child = spawn(process.execPath, [scriptPath, ...args], { stdio: "inherit", cwd });
  child.on("exit", (code) => process.exit(code ?? 0));
}

// ---------------------------------------------------------------- subcommand

function cmdDoctor() {
  out(bold("VETTO proof · doctor"));
  const major = nodeMajor();
  if (major >= 22) ok(`node ${process.version} (${process.execPath})`);
  else warn(`node ${process.version} terlalu tua — butuh >= 22 (pasang dari nodejs.org, lalu buka terminal baru)`);

  if (haveDeps()) ok("dependency terpasang (apps/web/node_modules)");
  else warn("dependency belum terpasang → node scripts/proof.mjs install");

  if (existsSync(join(WEB, ".env.local"))) ok(".env.local ada (dipakai subcommand check)");
  else info(".env.local tidak ada — bukti tetap jalan lewat RPC publik");

  const python = findPython();
  if (python) ok(`render siap (${python} + Pillow + imageio-ffmpeg)`);
  else warn(`render video belum siap → ${WIN ? "py -m pip install pillow imageio-ffmpeg" : "python3 -m pip install pillow imageio-ffmpeg"}`);

  const hasFfmpeg = spawnSync(WIN ? "where" : "which", ["ffmpeg"], { stdio: "ignore" }).status === 0;
  if (hasFfmpeg) ok("ffmpeg ada di PATH (imageio-ffmpeg juga membawa ffmpeg sendiri)");
  else info("ffmpeg tidak di PATH — imageio-ffmpeg masih bisa menyediakannya");

  if (existsSync(PROOF)) ok("scripts/mainnet-proof.mjs ada");
  else warn("scripts/mainnet-proof.mjs hilang");
  out("");
}

function cmdInstall() {
  out(bold("VETTO proof · install"));
  if (nodeMajor() < 22) die("Node >= 22 dibutuhkan. Pasang dari https://nodejs.org lalu buka terminal baru.");
  info("memakai pnpm 9.15.0 lewat npx (repo ini workspace pnpm, npm install tidak akan benar)");
  const result = run(NPX, ["--yes", "pnpm@9.15.0", "install", "--frozen-lockfile"]);
  if (result.status !== 0) {
    die(
      "instalasi gagal.\n" +
        "    Coba manual: corepack enable, lalu pnpm install\n" +
        "    Kalau lockfile berbeda dengan commit Anda: pnpm install --no-frozen-lockfile",
    );
  }
  haveDeps() ? ok("selesai") : die("setelah instalasi, apps/web/node_modules/viem masih tidak ada.");
}

function ensureDeps() {
  if (haveDeps()) return;
  bold("dependency belum ada — memasang sekarang (sekali saja, beberapa menit)");
  cmdInstall();
}

function cmdProof(args) {
  if (nodeMajor() < 22) {
    die(
      `node ${process.version} terlalu tua.\n` +
        "    Pasang Node 22+ dari https://nodejs.org (pilih LTS), tutup terminal, buka lagi, lalu ulangi.",
    );
  }
  ensureDeps();
  runNode(PROOF, args, WEB);
}

function cmdQuote(size) {
  cmdProof(["--eth", size ?? "0.0005"]);
}

function cmdCheck(size) {
  ensureDeps();
  const envFile = join(WEB, ".env.local");
  if (!existsSync(envFile)) {
    die(
      "apps/web/.env.local tidak ada. `check` butuh RPC primer + sekunder + alamat USDG.\n" +
        "    Tanpa env, bukti tetap jalan: node scripts/proof.mjs",
    );
  }
  const text = readFileSync(envFile, "utf8");
  const missing = ["ROBINHOOD_RPC_URL_PRIMARY", "ROBINHOOD_RPC_URL_SECONDARY", "ROBINHOOD_USDG_ADDRESS"].filter(
    (key) => !new RegExp(`^${key}=.+`, "m").test(text),
  );
  if (missing.length) {
    die(`apps/web/.env.local belum berisi: ${missing.join(", ")}\n    Tambahkan, lalu ulangi: node scripts/proof.mjs check`);
  }
  out(bold("VETTO proof · check 1/2 — deployment & pool"));
  const first = run(process.execPath, ["--env-file=.env.local", "scripts/verify-chain.mjs"], { cwd: WEB });
  if (first.status !== 0) die("verify-chain gagal (baca pesan di atas).");
  out(bold("VETTO proof · check 2/2 — quote dua RPC"));
  const second = run(process.execPath, ["--env-file=.env.local", "scripts/verify-dual-rpc-quote.mjs", size ?? "0.0005"], {
    cwd: WEB,
  });
  if (second.status !== 0) die("verify-dual-rpc-quote gagal (baca pesan di atas).");
  ok("check selesai");
}

/**
 * Rekam + render. Di Linux `script(1)` memberi TTY palsu; di Windows tidak ada,
 * jadi warna dipaksa dengan --ansi dan stdout ditangkap langsung.
 */
function cmdRecord() {
  if (nodeMajor() < 22) die("Node >= 22 dibutuhkan untuk merekam.");
  ensureDeps();
  mkdirSync(PROOF_DIR, { recursive: true });

  out(bold("VETTO proof · rekam"));
  const capture = spawnSync(process.execPath, [PROOF, "--eth", "0.0005", "--ansi"], {
    cwd: WEB,
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (capture.status !== 0) {
    process.stderr.write(String(capture.stderr ?? ""));
    die("rekaman gagal — jalankan dulu: node scripts/proof.mjs");
  }
  // Samakan dengan hasil `script(1)`: VR tanpa CR, escape code dibiarkan.
  const ansi = String(capture.stdout ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "");
  writeFileSync(CAPTURE, ansi, "utf8");
  ok(`capture → docs/proof/run.ansi (${ansi.split("\n").length - 1} baris)`);

  const findings = spawnSync(process.execPath, [PROOF, "--eth", "0.0005", "--json"], {
    cwd: WEB,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (findings.status === 0) {
    writeFileSync(FINDINGS, findings.stdout ?? "", "utf8");
    ok("findings → docs/proof/run.json");
  } else {
    warn("gagal menulis run.json (bukan blocker untuk video)");
  }

  out(bold("VETTO proof · render"));
  let python = findPython();
  if (!python && !process.env.PROOF_NO_INSTALL) python = installPythonDeps();
  if (!python) {
    warn("render butuh Python + Pillow + imageio-ffmpeg:");
    info(WIN ? "py -m pip install pillow imageio-ffmpeg" : "python3 -m pip install pillow imageio-ffmpeg");
    info("capture ANSI sudah jadi — render bisa dijalankan nanti tanpa merekam ulang:");
    info(`  ${python ?? "python"} docs/proof/render_video.py`);
    return;
  }
  const rendered = run(python, [RENDER]);
  if (rendered.status !== 0) die("render gagal (baca pesan di atas).");
  ok("selesai: docs/proof/mainnet-proof.mp4 + mainnet-proof-poster.png");
}

function usage() {
  const commands = [
    ["(tanpa argumen)", "bukti mainnet, 0.0005 ETH"],
    ["0.001", "ukuran lain, dalam ETH"],
    ["--json", "findings sebagai JSON (aman dipipa ke jq)"],
    ["--tx 0x…", "periksa transaksi mainnet lain"],
    ["quote 0.0005", "quote live di tiga pool (0.05/0.30/1.00%)"],
    ["check", "verify-chain + quote dua RPC (butuh apps/web/.env.local)"],
    ["record", "rekam ANSI + render MP4 ke docs/proof/"],
    ["install", "pasang dependency (pnpm workspace)"],
    ["doctor", "cek node, dependency, python, ffmpeg"],
  ];
  const width = Math.max(...commands.map(([name]) => name.length));
  out(bold("VETTO proof · perintah"));
  for (const [name, note] of commands) out(`  node scripts/proof.mjs ${name.padEnd(width)}  ${dim(note)}`);
  out("");
  out(dim("  Read-only: tidak ada tanda tangan atau pengiriman transaksi."));
  out(dim("  Exit 0 = selesai, exit 2 = prasyarat belum siap."));
  out("");
}

// ---------------------------------------------------------------- dispatch
const argv = process.argv.slice(2);
const first = argv[0] ?? "";

switch (first) {
  case "":
    cmdProof(["--eth", "0.0005"]);
    break;
  case "-h":
  case "--help":
  case "help":
    usage();
    break;
  case "doctor":
    cmdDoctor();
    break;
  case "install":
    cmdInstall();
    break;
  case "check":
    cmdCheck(argv[1]);
    break;
  case "quote":
    cmdQuote(argv[1]);
    break;
  case "record":
    cmdRecord();
    break;
  case "--json":
    cmdProof(["--eth", argv[1] ?? "0.0005", "--json"]);
    break;
  case "--tx":
    cmdProof(["--tx", argv[1] ?? ""].filter(Boolean));
    break;
  case "--eth":
    cmdProof(["--eth", argv[1] ?? "0.0005"]);
    break;
  default:
    cmdProof(argv);
}
