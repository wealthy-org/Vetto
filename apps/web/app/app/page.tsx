import { Suspense } from "react";
import { ChatApp } from "@/components/ChatApp";
import { activeProfile } from "@/lib/chain-profile";

export const metadata = { title: "App · VETTO" };
export const dynamic = "force-dynamic";

export default function Page() {
  // The server decides which chain this deployment runs on, so the chat renders
  // the chain the API will actually quote and simulate on — even if a stale
  // client bundle still carries the old NEXT_PUBLIC_* value.
  const profile = activeProfile();

  return (
    <Suspense fallback={null}>
      <ChatApp
        chain={{
          label: `${profile.name} · ${profile.chainId}`,
          short: profile.name,
          testnet: profile.isTestnet,
          explorer: profile.explorer,
        }}
      />
    </Suspense>
  );
}
