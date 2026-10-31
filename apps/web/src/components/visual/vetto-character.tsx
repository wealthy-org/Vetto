
import { useId } from "react";

type VettoCharacterProps = {
  size?: number;
  className?: string;
  animated?: boolean;
};

export function VettoCharacter({
  size = 320,
  className = "",
  animated = true,
}: VettoCharacterProps) {
  const id = useId().replace(/:/g, "");

  return (
    <div
      className={`vetto-character ${animated ? "is-animated" : ""} ${className}`}
      style={{ width: size, maxWidth: "100%" }}
      role="img"
      aria-label="VETTO AI character"
    >
      <div className="vetto-character__aura" />
      <div className="vetto-character__orbit vetto-character__orbit--outer" />
      <div className="vetto-character__orbit vetto-character__orbit--inner" />

      <svg
        className="vetto-character__artwork"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`${id}-core`} cx="0" cy="0" r="1"
            gradientTransform="matrix(0 190 -190 0 200 105)"
            gradientUnits="userSpaceOnUse">
            <stop stopColor="#A78BFA" />
            <stop offset=".48" stopColor="#6D28D9" />
            <stop offset="1" stopColor="#21113F" />
          </radialGradient>

          <linearGradient id={`${id}-shell`} x1="93" y1="90" x2="305" y2="315"
            gradientUnits="userSpaceOnUse">
            <stop stopColor="#E9D5FF" stopOpacity=".9" />
            <stop offset=".35" stopColor="#8B5CF6" />
            <stop offset="1" stopColor="#31205B" />
          </linearGradient>

          <linearGradient id={`${id}-face`} x1="125" y1="150" x2="275" y2="265"
            gradientUnits="userSpaceOnUse">
            <stop stopColor="#171321" />
            <stop offset="1" stopColor="#08070D" />
          </linearGradient>

          <linearGradient id={`${id}-eye`} x1="145" y1="190" x2="255" y2="220"
            gradientUnits="userSpaceOnUse">
            <stop stopColor="#C4B5FD" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>

          <filter id={`${id}-glow`} x="0" y="0" width="400" height="400"
            filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="12" />
          </filter>

          <filter id={`${id}-soft-glow`} x="0" y="0" width="400" height="400"
            filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Ambient energy */}
        <circle
          cx="200"
          cy="200"
          r="115"
          fill="#8B5CF6"
          opacity=".22"
          filter={`url(#${id}-glow)`}
        />

        {/* Rear structure */}
        <path
          d="M200 47L314 112V244L200 310L86 244V112L200 47Z"
          stroke="#8B5CF6"
          strokeOpacity=".3"
          strokeWidth="1.5"
        />

        <path
          d="M200 66L296 121V233L200 288L104 233V121L200 66Z"
          stroke="#C4B5FD"
          strokeOpacity=".18"
          strokeWidth="1"
          strokeDasharray="4 8"
        />

        {/* Main shell */}
        <path
          d="M200 80C265 80 310 127 310 192V213C310 277 264 320 200 320C136 320 90 277 90 213V192C90 127 135 80 200 80Z"
          fill={`url(#${id}-core)`}
          stroke={`url(#${id}-shell)`}
          strokeWidth="3"
        />

        {/* Shell highlights */}
        <path
          d="M119 151C130 113 162 91 199 91"
          stroke="white"
          strokeOpacity=".55"
          strokeWidth="3"
          strokeLinecap="round"
        />

        <path
          d="M279 258C260 292 234 308 202 310"
          stroke="#C4B5FD"
          strokeOpacity=".35"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Side panels */}
        <path
          d="M91 183L73 197V230L92 243"
          stroke="#A78BFA"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M309 183L327 197V230L308 243"
          stroke="#A78BFA"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Face visor */}
        <rect
          x="119"
          y="157"
          width="162"
          height="106"
          rx="43"
          fill={`url(#${id}-face)`}
          stroke="#C4B5FD"
          strokeOpacity=".42"
          strokeWidth="2"
        />

        <rect
          x="125"
          y="163"
          width="150"
          height="94"
          rx="38"
          stroke="white"
          strokeOpacity=".06"
        />

        {/* Eyes glow */}
        <ellipse
          cx="161"
          cy="205"
          rx="13"
          ry="18"
          fill="#A78BFA"
          opacity=".65"
          filter={`url(#${id}-soft-glow)`}
        />

        <ellipse
          cx="239"
          cy="205"
          rx="13"
          ry="18"
          fill="#A78BFA"
          opacity=".65"
          filter={`url(#${id}-soft-glow)`}
        />

        {/* Eyes */}
        <path
          d="M150 205C150 197 155 191 162 191C169 191 174 197 174 205C174 213 169 219 162 219C155 219 150 213 150 205Z"
          fill={`url(#${id}-eye)`}
        />

        <path
          d="M226 205C226 197 231 191 238 191C245 191 250 197 250 205C250 213 245 219 238 219C231 219 226 213 226 205Z"
          fill={`url(#${id}-eye)`}
        />

        {/* Forehead indicator */}
        <circle cx="200" cy="137" r="5" fill="#DDD6FE" />
        <circle cx="200" cy="137" r="12" stroke="#DDD6FE" strokeOpacity=".25" />

        {/* Lower shell details */}
        <path
          d="M169 279C181 287 219 287 231 279"
          stroke="#DDD6FE"
          strokeOpacity=".5"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <path
          d="M185 294H215"
          stroke="#A78BFA"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Energy particles */}
        <circle cx="80" cy="125" r="3" fill="#C4B5FD" />
        <circle cx="320" cy="145" r="2.5" fill="#A78BFA" />
        <circle cx="111" cy="302" r="2" fill="#DDD6FE" />
        <circle cx="290" cy="300" r="3" fill="#C4B5FD" />
      </svg>

      <div className="vetto-character__base">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
