import { memo } from "react";
import { boardProfiles } from "./profiles";

/** Configuration-only props: no telemetry, selection, freshness or callbacks. */
export const BoardArtwork = memo(function BoardArtwork({
  profileId,
}: {
  profileId: string;
}) {
  const profile = Object.hasOwn(boardProfiles, profileId)
    ? boardProfiles[profileId]
    : boardProfiles.generic;
  const generic = !["uno-r3", "uno-r4"].includes(profile.artwork);
  return (
    <g data-static-artwork={profile.id}>
      <path
        d="M18 14 H294 Q308 14 308 28 V192 Q308 208 292 208 H26 Q12 208 12 192 V150 H4 V64 H12 V28 Q12 14 18 14Z"
        fill={generic ? "#29434b" : "#14636b"}
        stroke="#67959a"
        strokeWidth="2"
      />
      <path
        d="M25 40 H290 M25 181 H290 M48 55 V166 H280"
        stroke="#74b9ae"
        fill="none"
        opacity=".2"
      />
      {[
        [30, 32],
        [289, 32],
        [30, 190],
        [289, 190],
      ].map(([x, y]) => (
        <g key={x + ":" + y}>
          <circle cx={x} cy={y} r="7" fill="#102c34" stroke="#85a9a3" />
          <circle cx={x} cy={y} r="3" fill="#a1b3ad" />
        </g>
      ))}
      <rect
        x="4"
        y="78"
        width="48"
        height="55"
        rx="4"
        fill="#a7b7bd"
        stroke="#d2dee0"
      />
      <rect x="3" y="90" width="13" height="31" rx="2" fill="#263640" />
      <rect
        x="26"
        y="151"
        width="45"
        height="28"
        rx="3"
        fill="#101f27"
        stroke="#54676e"
      />
      <rect
        x="115"
        y="80"
        width={profile.artwork === "uno-r3" ? 125 : 78}
        height={profile.artwork === "uno-r3" ? 43 : 68}
        rx="4"
        fill="#152630"
        stroke="#6b8c8c"
      />
      {Array.from({ length: 10 }, (_, i) => (
        <g key={i}>
          <path
            d={`M${120 + i * 11} 74 V80 M${120 + i * 11} 123 V130`}
            stroke="#aab5a5"
            strokeWidth="3"
          />
        </g>
      ))}
      {profile.artwork === "uno-r4" && (
        <g>
          <rect x="211" y="62" width="67" height="44" rx="3" fill="#8b9a9f" />
          <path
            d="M215 66 H271 V73 H222 V80 H271"
            stroke="#d9e1db"
            fill="none"
          />
          {Array.from({ length: 24 }, (_, i) => (
            <circle
              key={i}
              cx={214 + (i % 8) * 8}
              cy={137 + Math.floor(i / 8) * 8}
              r="2.5"
              fill="#305059"
            />
          ))}
        </g>
      )}
      <rect x="78" y="11" width="205" height="19" rx="3" fill="#152a31" />
      {Array.from({ length: 14 }, (_, i) => (
        <rect
          key={i}
          x={87 + i * 14}
          y="16"
          width="9"
          height="8"
          rx="1"
          fill="#acb5a3"
        />
      ))}
      <rect x="174" y="193" width="111" height="18" rx="3" fill="#152a31" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={i}
          x={187 + i * 14}
          y="198"
          width="9"
          height="8"
          rx="1"
          fill="#acb5a3"
        />
      ))}
      <text x="83" y="162" fill="#e0f0ed" fontSize="21" fontWeight="700">
        {generic ? "CONTROLLER" : "UNO"}
      </text>
      <text x="84" y="178" fill="#bdd6d5" fontSize="9">
        {generic
          ? "GENERIC REPRESENTATION"
          : profile.artwork === "uno-r3"
            ? "R3 · ARTWORK PROFILE"
            : "R4 WiFi · ARTWORK PROFILE"}
      </text>
      {!generic &&
        Object.entries(profile.pins).map(([pin, p]) => (
          <text
            key={pin}
            x={p.x}
            y={pin.startsWith("A") ? 190 : 42}
            fill="#d4e5dc"
            fontSize="7"
            textAnchor="middle"
          >
            {pin}
          </text>
        ))}
    </g>
  );
});

export const ModuleArtwork = memo(function ModuleArtwork({
  kind,
}: {
  kind: string;
}) {
  return (
    <g data-static-artwork={kind}>
      <rect
        width="106"
        height="74"
        rx="10"
        fill={kind === "sensor" ? "#205861" : "#293c4b"}
        stroke="#82949e"
        strokeWidth="1.5"
      />
      {kind === "actuator" ? (
        <>
          <circle cx="53" cy="34" r="20" fill="#142833" stroke="#8b9d9c" />
          <circle cx="53" cy="34" r="12" fill="#536670" />
        </>
      ) : kind === "gateway" || kind === "transport" ? (
        <>
          <rect
            x="22"
            y="22"
            width="62"
            height="28"
            rx="4"
            fill="#111f29"
            stroke="#9bb3b4"
          />
          <path
            d="M30 29 H76 M30 36 H76 M30 43 H76"
            stroke="#658a9c"
            strokeWidth="3"
          />
        </>
      ) : (
        <>
          <rect x="24" y="15" width="58" height="40" rx="4" fill="#98afb2" />
          <circle
            cx="53"
            cy="35"
            r="12"
            fill="#385560"
            stroke="#e0d4a5"
            strokeWidth="3"
          />
        </>
      )}
      {[23, 43, 63, 83].map((x) => (
        <rect
          key={x}
          x={x}
          y="68"
          width="5"
          height="12"
          rx="1"
          fill="#c3b58e"
        />
      ))}
    </g>
  );
});
