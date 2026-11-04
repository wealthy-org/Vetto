
import Link from "next/link";
import { Banker, SpeechBubble } from "./Banker";
import { Logo } from "./Logo";
import { WalletConnectSignIn } from "./WalletConnectSignIn";

export function AuthShell() {
  return (
    <div className="relative flex min-h-[100svh] flex-col">
      <div className="text-field pointer-events-none absolute inset-0 -z-10" />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 text-sm">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-5 text-white/70">
          <Link href="/" className="hover:text-white">Back to site</Link>
          <Link href="/docs" className="hover:text-white">Docs</Link>
        </div>
      </header>

      <main className="mx-auto grid w-full min-w-0 max-w-4xl flex-1 items-center gap-5 px-5 pb-10 md:grid-cols-[1.2fr_1fr]">
        <section
          className="glass relative hidden h-[520px] overflow-hidden rounded-[28px] md:block"
          aria-label="VETTO"
        >
          <div className="absolute left-5 top-5 max-w-[250px]">
            <SpeechBubble>
              Your banker is ready. Connect your wallet and let's get to work. I'll never ask for your seed phrase.
            </SpeechBubble>
          </div>
          <Banker
            pose="wave"
            className="absolute bottom-[-30px] left-1/2 h-[470px] w-auto -translate-x-1/2"
          />
        </section>

        <section className="auth-panel min-w-0 rounded-[28px] p-5 sm:p-7" aria-labelledby="auth-h">
          <p className="text-sm text-lilac">VETTO WALLET ACCESS</p>
          <h1 id="auth-h" className="h-display mt-2 text-4xl">
            Meet your banker.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/55">
            Connect your wallet to access your personal DeFi assistant.
          </p>

          <div className="mt-8">
            <WalletConnectSignIn />
          </div>

          <div className="mt-7 rounded-2xl bg-white/[.035] p-4 text-xs leading-relaxed text-white/60">
            <p className="font-semibold text-white/80">Your wallet. Your control.</p>
            <p className="mt-2">
              Signing in creates a secure browser session using a wallet message signature.
              It does not approve token spending or send transactions.
            </p>
            <Link href="/app" className="btn btn-primary mt-4 w-full">
              Continue in preview
            </Link>
          </div>

          <ul className="mt-6 space-y-2 text-xs text-white/45">
            <li><span className="mr-2 text-mint">✓</span>You remain in control of your funds.</li>
            <li><span className="mr-2 text-mint">✓</span>VETTO never asks for your seed phrase or private key.</li>
            <li><span className="mr-2 text-mint">✓</span>Transactions require your wallet confirmation.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
