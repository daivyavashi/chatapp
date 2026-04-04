import PusherClient from "pusher-js";

/**
 * Creates a client-side Pusher instance tied to a specific logged-in user.
 * Called after login so the username is baked into the auth endpoint URL.
 */
export function createPusherClient(username: string): PusherClient {
  return new PusherClient(
    process.env.NEXT_PUBLIC_PUSHER_KEY || "app-key",
    {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1",
      authEndpoint: `/api/pusher/auth?username=${encodeURIComponent(username)}`,
    }
  );
}
