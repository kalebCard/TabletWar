"use client"

import React from "react"
import { classify, sortedDesc, type Die } from "@/lib/game/dice"

export function DiceGrid({ dice, target }: { dice: Die[]; target: number }) {
  if (dice.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 py-2">
      {sortedDesc(dice).map((d, i) => {
        const c = classify(d.value, target)
        return (
          <div
            key={d.id}
            className={`animate-dice-fall relative flex h-8 w-8 items-center justify-center rounded-md font-mono text-[14px] font-black tabular-nums shadow-lg transition-transform hover:scale-105 ${
              c.success ? "bg-[oklch(0.6_0.15_150)] text-white shadow-[0_0_10px_rgba(0,255,100,0.3)]" : "bg-black/40 text-muted-foreground/60 border border-white/10"
            } ${c.crit6 ? "ring-2 ring-[oklch(0.9_0.16_150)] shadow-[0_0_15px_rgba(100,255,150,0.5)]" : ""} ${c.crit1 ? "ring-2 ring-destructive shadow-[0_0_15px_rgba(255,0,0,0.5)] bg-destructive/20 text-destructive" : ""}`}
            style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}
            title={d.rerolled ? "re-rolled" : undefined}
          >
            {d.value}
            {d.rerolled && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_5px_currentColor]" />}
          </div>
        )
      })}
    </div>
  )
}

export function RerollRow({ onOnes, onFails }: { onOnes: () => void; onFails: () => void }) {
  return (
    <div className="flex gap-2 mt-1">
      <button
        onClick={onOnes}
        className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground active:scale-95"
      >
        Repetir 1s
      </button>
      <button
        onClick={onFails}
        className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground active:scale-95"
      >
        Repetir fallos
      </button>
    </div>
  )
}

export function Step({
  n,
  title,
  sub,
  active,
  done,
  children,
}: {
  n: number
  title: string
  sub: string
  active: boolean
  done: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border p-4 transition-all duration-300 ${
        active ? "border-primary/40 bg-primary/5 shadow-[0_0_15px_rgba(0,150,255,0.05)]" : "border-white/5 bg-black/20"
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-black shadow-sm ${
            done ? "bg-primary text-primary-foreground shadow-[0_0_10px_currentColor]" : "bg-white/10 text-muted-foreground border border-white/10"
          }`}
        >
          {n}
        </span>
        <span className={`font-mono text-[13px] font-bold uppercase tracking-widest ${active ? 'text-primary drop-shadow-sm' : 'text-foreground'}`}>{title}</span>
        <span className="ml-auto font-mono text-[11px] font-semibold text-muted-foreground/70">{sub}</span>
      </div>
      {children}
    </div>
  )
}

export function Result({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <div className="flex items-center justify-between font-mono text-[11px]">
      <span className="uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">
        <b>{value}</b> / {of}
      </span>
    </div>
  )
}

export function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  )
}

export function Tag({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <span
      className={`rounded px-1 py-0.5 text-[9px] uppercase tracking-wider ${
        danger ? "bg-destructive/20 text-destructive" : "bg-[oklch(0.5_0.08_150)]/25 text-[oklch(0.8_0.12_150)]"
      }`}
    >
      {children}
    </span>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-black/10">
      <p className="max-w-[16rem] text-pretty font-sans text-sm leading-relaxed text-muted-foreground/80">
        {children}
      </p>
    </div>
  )
}
