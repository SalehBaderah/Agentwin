export type Anchor = { x: number; y: number };
export type BoardProfile = {
  id: string;
  label: string;
  width: number;
  height: number;
  artwork: string;
  pins: Record<string, Anchor>;
};
const unoPins = Object.fromEntries([
  ...Array.from({ length: 14 }, (_, i) => ["D" + i, { x: 92 + i * 14, y: 20 }]),
  ...Array.from({ length: 6 }, (_, i) => [
    "A" + i,
    { x: 192 + i * 14, y: 202 },
  ]),
]) as Record<string, Anchor>;
export const boardProfiles: Record<string, BoardProfile> = {
  generic: {
    id: "generic",
    label: "Generic controller",
    width: 320,
    height: 220,
    artwork: "generic",
    pins: {},
  },
  "arduino-uno-r3": {
    id: "arduino-uno-r3",
    label: "Arduino UNO R3",
    width: 320,
    height: 220,
    artwork: "uno-r3",
    pins: unoPins,
  },
  "arduino-uno-r4-wifi": {
    id: "arduino-uno-r4-wifi",
    label: "Arduino UNO R4 WiFi",
    width: 320,
    height: 220,
    artwork: "uno-r4",
    pins: unoPins,
  },
};
const aliases: Record<string, string> = {
  "arduino-uno": "arduino-uno-r3",
  "uno-r4": "arduino-uno-r4-wifi",
};
export function resolveProfile(local: string | undefined, configured: unknown) {
  const requested =
    local ||
    (typeof configured === "string" && configured ? configured : "generic");
  const id = Object.hasOwn(aliases, requested) ? aliases[requested] : requested;
  const known = Object.hasOwn(boardProfiles, id);
  return {
    profile: known ? boardProfiles[id] : boardProfiles.generic,
    unknown: !known,
    requested,
  };
}
export const profilePreferenceKey = (project: string, device: string) =>
  "agentwin-artwork:" + project + ":" + device;
export function readProfilePreference(
  storage: Pick<Storage, "getItem">,
  key: string,
): string | undefined {
  try {
    const value = JSON.parse(storage.getItem(key) || "null");
    return typeof value === "string" && value.length <= 100 ? value : undefined;
  } catch {
    return undefined;
  }
}
