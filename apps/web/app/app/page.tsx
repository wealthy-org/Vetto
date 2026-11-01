import { Suspense } from "react";
import { ChatApp } from "@/components/ChatApp";

export const metadata = { title: "App · VETTO" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChatApp />
    </Suspense>
  );
}
