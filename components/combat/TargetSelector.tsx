import type { TargetInfo } from "@/lib/game/combat"
import { Tag } from "./DiceRollStep"

interface Props {
  targets: TargetInfo[]
  targetId: string | null
  activeAttackId: string | null
  onSetTarget: (id: string | null) => void
}

export function TargetSelector({ targets, targetId, activeAttackId, onSetTarget }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground mt-2">
        Objetivo
      </span>
      {targets.length === 0 && (
        <span className="font-sans text-sm text-muted-foreground/70">No hay miniaturas enemigas al alcance.</span>
      )}
      {targets.map((t) => {
        const isTargeted = activeAttackId ? activeAttackId === t.token.id : targetId === t.token.id
        return (
          <button
            key={t.token.id}
            disabled={!t.eligible && !isTargeted}
            onClick={() => !activeAttackId && onSetTarget(t.token.id)}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all duration-200 shadow-sm ${
              isTargeted
                ? "border-destructive/50 bg-destructive/10 shadow-[0_0_15px_rgba(255,0,0,0.1)]"
                : "border-white/10 bg-white/5 hover:bg-white/10"
            } ${!t.eligible && !isTargeted ? "cursor-not-allowed opacity-40 grayscale" : ""}`}
          >
            <span
              className={`font-sans text-sm font-bold ${
                isTargeted ? "text-destructive drop-shadow-sm" : "text-foreground"
              }`}
            >
              {t.token.name}
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] font-bold text-muted-foreground">
              <span>{t.distance.toFixed(1)}&quot;</span>
              {t.cover && <Tag>cobertura</Tag>}
              {t.losBlocked && <Tag danger>sin ldv</Tag>}
              {!t.inRange && <Tag danger>lejos</Tag>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
