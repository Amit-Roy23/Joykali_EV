import { handle } from "@/lib/route";
import { markRead, myNotifications } from "@/services/notificationService";

export const GET = handle(async ({ user }) => myNotifications(user.userId));
/** { ids?: string[] } — no ids marks everything read. */
export const POST = handle(async ({ req, user }) => {
  const b = await req.json().catch(() => ({}));
  return markRead(user.userId, b.ids);
});
