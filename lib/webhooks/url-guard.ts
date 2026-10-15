import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// SSRF guard for webhook URLs: https only, no credentials, no internal host
// names, and every address the host resolves to must be public. The URL is
// checked when saved and again before every delivery (DNS can change), and
// deliveries never follow redirects (lib/webhooks/deliver.ts).

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

const INTERNAL_HOST = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;
const URL_MAX = 2048;

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family !== 6) return false;
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  return !blocked.check(address, "ipv6");
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

/** Why this URL cannot receive webhooks, or null when it can (before DNS). */
export function webhookUrlProblem(raw: string): string | null {
  if (raw.length > URL_MAX) return "The URL is too long.";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full URL, starting with https://.";
  }
  if (url.protocol !== "https:") return "Webhook URLs must use https://.";
  if (url.username || url.password) return "Put credentials in the signature check, not in the URL.";
  const host = hostOf(url);
  if (INTERNAL_HOST.test(host)) return "Webhooks cannot go to an internal host.";
  if (isIP(host) && !isPublicAddress(host)) return "Webhooks cannot go to a private address.";
  return null;
}

export type Lookup = (hostname: string) => Promise<Array<{ address: string }>>;

const lookupAll: Lookup = (hostname) => lookup(hostname, { all: true, verbatim: true });

/** True when every address the URL's host resolves to is public. */
export async function resolvesPublic(raw: string, resolve: Lookup = lookupAll): Promise<boolean> {
  const host = hostOf(new URL(raw));
  if (isIP(host)) return isPublicAddress(host);
  const addresses = await resolve(host);
  return addresses.length > 0 && addresses.every((entry) => isPublicAddress(entry.address));
}
