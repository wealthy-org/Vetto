import Link from "next/link";
import { Banker, SpeechBubble } from "./Banker";
import { Logo } from "./Logo";
import { WalletConnectSignIn } from "./WalletConnectSignIn";

/**
 * WalletConnect creates a wallet-backed session only; the session never grants transaction authority.
 */
export function AuthShell({ mode }: { mode: "sign-in" | "sign-up" }) {
  const up = mode === "sign-up";
  return (
    <div className="relative flex min-h-[100svh] flex-col">
      <div className="text-field pointer-events-none absolute inset-0 -z-10" />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 text-sm">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-5 text-white/70"><Link href="/" className="hover:text-white">Back to site</Link><Link href="/docs" className="hover:text-white">Docs</Link></div>
      </header>
      <main className="mx-auto grid w-full max-w-4xl flex-1 items-center gap-5 px-5 pb-10 md:grid-cols-[1.2fr_1fr]">
        <section className="glass relative hidden h-[520px] overflow-hidden rounded-[28px] md:block" aria-label="Vetto">
          <div className="absolute left-5 top-5 max-w-[250px]"><SpeechBubble>{up ? "A new client. Splendid. This takes a minute, and I will never ask for a seed phrase." : "Back already. Your funds are exactly where you left them."}</SpeechBubble></div>
          <Banker pose={up ? "wave" : "idle"} className="absolute bottom-[-30px] left-1/2 h-[470px] w-auto -translate-x-1/2" />
        </section>
        <section className="glass rounded-[28px] p-6" aria-labelledby="auth-h">
          <p className="text-sm text-lilac">{up ? "Create your account" : "Sign in"}</p>
          <h1 id="auth-h" className="h-display mt-1 text-4xl">{up ? "Meet your banker." : "Back to your banker."}</h1>

          <div className="mt-6 space-y-3">
            <WalletConnectSignIn mode={mode} />
            <p className="text-center text-[11px] text-white/35">Email sign-in is planned</p>
            <div className="flex gap-2">
              <label htmlFor="email" className="sr-only">Email</label>
              <input id="email" type="email" disabled placeholder="you@example.com" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[.03] px-3 py-2.5 text-sm opacity-70" />
              <button type="button" disabled className="btn btn-ghost opacity-70">Send code</button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-4 text-xs leading-relaxed text-white/60">
            Wallet sign-in uses an Ethereum Mainnet message only to create a browser session; it does not authorize or send a transaction. App execution on Robinhood Chain is not available. Email sign-in is not available yet. You can still look around in preview mode.
            <Link href="/app" className="btn btn-primary mt-3 w-full">Continue in preview</Link>
          </div>

          <ul className="mt-5 space-y-1.5 text-xs text-white/45">
            <li>Signing in never gives Vetto permission to move your funds.</li>
            <li>Vetto never asks for a seed phrase or private key.</li>
            <li>Any email or social wallet will be labelled custodial.</li>
          </ul>
          <p className="mt-5 text-sm text-white/55">{up ? "Already a client?" : "New to Vetto?"} <Link href={up ? "/sign-in" : "/sign-up"} className="font-semibold text-white">{up ? "Sign in" : "Create an account"}</Link></p>
        </section>
      </main>
    </div>
  );
}
