// Strong random passwords for the "Generate" button on temporary-password
// fields. Pure and browser-safe (Web Crypto only), so the client component
// imports it directly and the tests run under Node.

const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
// Symbols that survive copy-paste into email, chat and shells unquoted.
const SYMBOLS = "-_.!@#%+=";
const CLASSES = [LOWER, UPPER, DIGITS, SYMBOLS] as const;
const ALL = CLASSES.join("");

export const GENERATED_PASSWORD_LENGTH = 20;

type RandomSource = (bytes: Uint32Array) => Uint32Array;
const webCrypto: RandomSource = (bytes) => globalThis.crypto.getRandomValues(bytes);

/** Unbiased integer in [0, max): rejection sampling instead of a modulo bias. */
function randomBelow(max: number, random: RandomSource): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    const value = random(buffer)[0];
    if (value < limit) return value % max;
  }
}

/**
 * A password of `length` characters with at least one lower case letter, upper
 * case letter, digit and symbol (so it always passes the password policy), and
 * no look-alike characters (0/O, 1/l/I) that are hard to read aloud or retype.
 */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH, random: RandomSource = webCrypto): string {
  if (!Number.isInteger(length) || length < CLASSES.length || length > 128) throw new RangeError("length must be 4..128");
  const chars = CLASSES.map((set) => set[randomBelow(set.length, random)]);
  while (chars.length < length) chars.push(ALL[randomBelow(ALL.length, random)]);
  // Fisher-Yates, so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1, random);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
