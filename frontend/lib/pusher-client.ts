import PusherClient from "pusher-js";

/**
 * Client-side Pusher configuration.
 */
export const pusherClient = new PusherClient(
  process.env.NEXT_PUBLIC_PUSHER_KEY!,
  {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    authEndpoint: "/api/pusher/auth", // if using private/presence channels
  }
);
