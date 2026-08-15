import { Weapon } from "@/lib/game/types"
import { skillLabel } from "@/lib/game/combat"
import { Chip } from "./DiceRollStep"

interface Props {
  weapons: Weapon[]
  weaponIdx: number | null
  setWeaponIdx: (idx: number) => void
}

export function WeaponSelector({ weapons, weaponIdx, setWeaponIdx }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {weapons.map((w, i) => (
        <button
          key={w.name}
          onClick={() => setWeaponIdx(i)}
          className={`rounded-xl border px-4 py-3 text-left transition-all duration-200 shadow-sm ${
            weaponIdx === i
              ? "border-primary/50 bg-primary/10 shadow-[0_0_15px_rgba(0,150,255,0.1)]"
              : "border-white/10 bg-white/5 hover:bg-white/10"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-sans text-sm font-bold text-foreground">{w.name}</span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {w.type === "ranged" ? `${w.range}"` : "melee"}
            </span>
          </div>
          <div className="mt-2 flex gap-3 font-mono text-[11px] font-bold text-muted-foreground/80">
            <Chip label="A" value={`${w.attacks}`} />
            <Chip label={w.type === "ranged" ? "BS" : "WS"} value={skillLabel(w.skill)} />
            <Chip label="S" value={`${w.strength}`} />
            <Chip label="AP" value={`${w.ap}`} />
            <Chip label="D" value={`${w.damage}`} />
          </div>
          {w.abilities && w.abilities.length > 0 && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {w.abilities.map((a) => (
                <span
                  key={a}
                  className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary border border-primary/30"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
