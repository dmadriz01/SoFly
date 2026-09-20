"use client";

import { useTransition } from "react";
import { removePushSubscription, signOut } from "@/app/actions";
import { thisDeviceSubscription } from "@/lib/push-client";

/**
 * Logging out also turns push off for this device, so the next person to use a shared phone
 * doesn't see the previous person's notifications.
 */
export function LogoutButton() {
  const [pending, start] = useTransition();

  function logOut(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        if ("serviceWorker" in navigator) {
          const sub = await thisDeviceSubscription();
          if (sub) {
            await removePushSubscription(sub.endpoint);
            await sub.unsubscribe();
          }
        }
      } catch {
        // Logging out must always work, whatever happens to the notification cleanup.
      }
      await signOut();
    });
  }

  return (
    <form action={signOut} onSubmit={logOut}>
      <button disabled={pending} className="btn-secondary tap !px-4 !py-2 text-sm">
        {pending ? "Logging out…" : "Log out"}
      </button>
    </form>
  );
}
