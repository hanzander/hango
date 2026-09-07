import { Suspense } from "react";
import { ChatWorkspace } from "@/components/app/ChatWorkspace";

export default function DemoAppPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-bg text-sm text-text-muted">
          Loading Hango…
        </div>
      }
    >
      <ChatWorkspace demo serverId="srv-lounge" channelId="ch-general" />
    </Suspense>
  );
}
