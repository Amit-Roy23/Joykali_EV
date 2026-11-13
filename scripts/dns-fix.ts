import dns from "node:dns";

/**
 * Local scripts only (seed, setup:admin).
 *
 * `mongodb+srv://` URIs need a DNS SRV lookup. Many home/office routers and some
 * ISPs refuse SRV queries, which shows up as `querySrv ECONNREFUSED` on Windows.
 * Asking public resolvers first (falling back to the system ones) avoids that.
 * The deployed app on Vercel does not use this — its DNS handles SRV fine.
 */
export function useReliableDnsForSrv(uri: string | undefined) {
  if (!uri?.startsWith("mongodb+srv://")) return;
  const system = dns.getServers();
  dns.setServers(["8.8.8.8", "1.1.1.1", ...system.filter((s) => s !== "8.8.8.8" && s !== "1.1.1.1")]);
}
