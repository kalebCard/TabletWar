"use client"

import type { LogEntry } from "@/lib/game/types"
import { FACTIONS } from "@/lib/game/constants"

export function BattleLog({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          Aún no hay eventos. Resuelve ataques y avanza fases para construir el registro de batalla.
        </p>
      </div>
    )
  }

  return (
    <ol className="flex h-full flex-col gap-1.5 overflow-y-auto p-3">
      {entries.map((e) => {
        const color = e.faction ? FACTIONS[e.faction].color : undefined
        return (
          <li
            key={e.id}
            className="flex gap-2 rounded-md border border-border bg-secondary/25 px-2.5 py-1.5"
          >
            <span
              className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: color ?? "oklch(0.5 0.02 250)" }}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                R{e.round} · {e.kind}
              </span>
              <span
                className={`font-mono text-[11px] leading-snug ${
                  e.kind === "casualty" ? "text-destructive" : "text-foreground"
                }`}
              >
                {e.text}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
