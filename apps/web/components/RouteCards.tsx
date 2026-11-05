"use client";

import { formatAmount } from "@/lib/format";
import type { RouteQuote } from "@vetto/quote-engine";

/**
 * The fanned route deck from the brief's reference layout: every real quote is a
 * card you can pick. One quote means one card — the deck is never padded.
 *
 * Badges only ever restate measured facts: the highest output of the returned
 * quotes ("Best output") and the pool's own fee tier. There is no invented
 * "fastest", "recommended" or "private" label, because none of those are
 * verified for these pools.
 */

interface Props {
  routes: RouteQuote[];
  selectedPath: string | null;
  onSelect: (executionPathId: string) => void;
  outSymbol: string;
  outDecimals: number;
  variant?: "fan" | "strip";
}

function bestOut(routes: RouteQuote[]): bigint {
  return routes.reduce<bigint>((max, route) => {
    const value = BigInt(route.expectedOutBaseUnits);
    return value > max ? value : max;
  }, 0n);
}

function feeBps(route: RouteQuote): number | undefined {
  return route.venueFeeBps;
}

function feeLabel(route: RouteQuote): string {
  const bps = route.venueFeeBps;
  if (bps === undefined) return "Uniswap v4";
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}% pool`;
}

function impactLabel(route: RouteQuote): string {
  if (route.priceImpactBps === undefined) return "impact n/a";
  return `${(route.priceImpactBps / 100).toFixed(2)}%`;
}

function gasLabel(route: RouteQuote): string {
  if (!route.gasCostWei) return "gas n/a";
  const eth = formatAmount(route.gasCostWei, 18, 8);
  return `${eth} ETH gas`;
}

function Badges({ route, isBest }: { route: RouteQuote; isBest: boolean }) {
  return (
    <>
      {isBest && <span className="badge badge-best">Best output</span>}
      {feeBps(route) !== undefined && <span className="badge badge-fee">{feeLabel(route)}</span>}
    </>
  );
}

export function RouteCards({ routes, selectedPath, onSelect, outSymbol, outDecimals, variant = "fan" }: Props) {
  if (routes.length === 0) return null;

  const best = bestOut(routes);
  const count = routes.length;

  if (variant === "strip") {
    return (
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {routes.map((route, index) => {
          const selected = route.executionPathId === selectedPath;
          const isBest = BigInt(route.expectedOutBaseUnits) === best;
          return (
            <li
              key={route.quoteId}
              className="deck-card shrink-0"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <button
                type="button"
                onClick={() => onSelect(route.executionPathId)}
                aria-pressed={selected}
                className={`w-[186px] rounded-[15px] border px-3 py-2 text-left ${
                  selected
                    ? "border-lilac/60 bg-[linear-gradient(168deg,#2a1f6b_0%,#1c1450_60%,#170f42_100%)] shadow-[0_12px_30px_rgba(120,84,240,.3)]"
                    : "border-white/[.14] bg-[linear-gradient(168deg,#1b1447_0%,#150f3a_62%,#120d33_100%)]"
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-[10px] text-white/40">
                  <span className="font-mono">0{index + 1}</span>
                  <span className="truncate">{feeLabel(route)}</span>
                </div>
                <p className="mt-1 truncate text-[15px] font-semibold leading-tight text-white">
                  {formatAmount(route.expectedOutBaseUnits, outDecimals)}{" "}
                  <span className="text-[10.5px] font-medium text-white/55">{outSymbol}</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[9.5px] text-white/40">
                  <span>{impactLabel(route)}</span>
                  <span className="text-white/20">·</span>
                  <span>{gasLabel(route)}</span>
                  {isBest && <span className="badge badge-best ml-auto">Best</span>}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const middle = (count - 1) / 2;

  return (
    <ul className="relative mx-auto h-[176px] w-full max-w-[700px]" aria-label="Route options">
      {routes.map((route, index) => {
        const selected = route.executionPathId === selectedPath;
        const isBest = BigInt(route.expectedOutBaseUnits) === best;
        const offset = index - middle;
        // Spacing is measured in card widths, so the deck fans the same way at
        // any container size: a slight overlap keeps neighbours readable.
        // Cards sit shoulder to shoulder like the reference deck: a hair of
        // overlap keeps them reading as one fan without hiding any number.
        const spread = count === 1 ? 0 : count === 2 ? 104 : 103;
        const rotate = count === 1 ? 0 : selected ? 0 : offset * 6;
        const lift = selected ? -22 : Math.abs(offset) * 9;

        return (
          <li
            key={route.quoteId}
            className="deck-card absolute bottom-0 left-1/2 w-[29%] min-w-[144px] max-w-[204px]"
            style={{
              animationDelay: `${index * 80}ms`,
              transform: `translateX(calc(-50% + ${offset * spread}%)) translateY(${lift}px) rotate(${rotate}deg)`,
              zIndex: selected ? 40 : 10 - Math.round(Math.abs(offset)),
              transition: "transform 0.42s cubic-bezier(0.16,1,0.3,1), filter 0.35s ease",
              filter: selected ? "none" : "brightness(0.82) saturate(0.92)",
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(route.executionPathId)}
              aria-pressed={selected}
              aria-label={`Route ${index + 1}: ${feeLabel(route)}, ${formatAmount(
                route.expectedOutBaseUnits,
                outDecimals,
              )} ${outSymbol}`}
              className={`block w-full rounded-[15px] border px-3 py-2.5 text-left ${
                selected
                  ? "border-lilac/60 bg-[linear-gradient(168deg,#2a1f6b_0%,#1c1450_58%,#170f42_100%)] shadow-[0_26px_54px_rgba(96,62,215,.45)]"
                  : "border-white/[.14] bg-[linear-gradient(168deg,#1b1447_0%,#150f3a_60%,#120d33_100%)] hover:border-white/30"
              }`}
            >
              <div className="flex items-center gap-1 overflow-hidden text-[9.5px] text-white/40">
                <span className="font-mono">0{index + 1}</span>
                <Badges route={route} isBest={isBest} />
              </div>

              <p className="mt-1.5 truncate text-[10.5px] leading-tight text-white/45">Uniswap v4</p>
              <p className="truncate text-[15px] font-semibold leading-tight text-white">
                {formatAmount(route.expectedOutBaseUnits, outDecimals)}{" "}
                <span className="text-[10.5px] font-medium text-white/55">{outSymbol}</span>
              </p>

              <div className="mt-1.5 flex items-center justify-between gap-1 text-[8.5px] text-white/40">
                <span className="shrink-0">{impactLabel(route)}</span>
                <span className="truncate">{gasLabel(route)}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
