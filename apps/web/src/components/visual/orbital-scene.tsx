
import type { ReactNode } from "react";

type OrbitalSceneProps = {
  children?: ReactNode;
  className?: string;
  size?: number;
  animated?: boolean;
};

export function OrbitalScene({
  children,
  className = "",
  size = 560,
  animated = true,
}: OrbitalSceneProps) {
  return (
    <div
      className={[
        "orbital-scene",
        animated ? "orbital-scene--animated" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, maxWidth: "100%" }}
    >
      <div className="orbital-scene__ambient" aria-hidden="true" />

      <svg
        className="orbital-scene__connections"
        viewBox="0 0 600 600"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="300"
          cy="300"
          r="125"
          stroke="#8B5CF6"
          strokeOpacity=".2"
          strokeDasharray="3 9"
        />

        <circle
          cx="300"
          cy="300"
          r="205"
          stroke="#A78BFA"
          strokeOpacity=".12"
          strokeDasharray="2 10"
        />

        <path
          d="M300 48V552M48 300H552"
          stroke="#A78BFA"
          strokeOpacity=".08"
          strokeDasharray="3 12"
        />

        <path
          d="M122 122L478 478M478 122L122 478"
          stroke="#A78BFA"
          strokeOpacity=".05"
          strokeDasharray="3 12"
        />

      </svg>

      <div className="orbital-scene__ring orbital-scene__ring--outer">
        <span className="orbital-scene__node orbital-scene__node--outer" />
        <span className="orbital-scene__node orbital-scene__node--outer-secondary" />
      </div>

      <div className="orbital-scene__ring orbital-scene__ring--middle">
        <span className="orbital-scene__node orbital-scene__node--middle" />
        <span className="orbital-scene__node orbital-scene__node--middle-secondary" />
      </div>

      <div className="orbital-scene__ring orbital-scene__ring--inner">
        <span className="orbital-scene__node orbital-scene__node--inner" />
      </div>

      <div className="orbital-scene__center">
        {children}
      </div>

      <div className="orbital-scene__marker orbital-scene__marker--top">
        <span />
        SYSTEM ACTIVE
      </div>

      <div className="orbital-scene__marker orbital-scene__marker--bottom">
        <span />
        ROBINHOOD CHAIN
      </div>
    </div>
  );
}
