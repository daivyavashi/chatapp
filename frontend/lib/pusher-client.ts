import PusherClient from "pusher-js";

/**
 * Client-side Pusher configuration.
 */
export const pusherClient = typeof window !== "undefined"
  ? new PusherClient(
      process.env.NEXT_PUBLIC_PUSHER_KEY || "app-key",
      {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "mt1",
        authEndpoint: "/api/pusher/auth", // if using private/presence channels
      }
    )
  : ({} as any);
