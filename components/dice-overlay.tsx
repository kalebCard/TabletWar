"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { EventBus } from "@/lib/game/EventBus"

interface DiceData {
  id: string
  value: number
  color: string
  startX: number
  startY: number
  endX: number
  endY: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Parabolic bounce curve (returns Z height 0 to 1)
const getBounceZ = (t: number) => {
   if (t < 0.3) return 1 - Math.pow(t/0.3, 2);
   if (t < 0.7) return 0.4 * (1 - Math.pow((t - 0.5)/0.2, 2));
   if (t < 0.9) return 0.1 * (1 - Math.pow((t - 0.8)/0.1, 2));
   if (t < 1.0) return 0.02 * (1 - Math.pow((t - 0.95)/0.05, 2));
   return 0;
}

export function DiceOverlay() {
  const [diceList, setDiceList] = useState<DiceData[]>([])

  useEffect(() => {
    const handleRoll = (data: { dice: { id: string, value: number }[], color: string }) => {
      const newDice: DiceData[] = data.dice.map((d, i) => {
        // Center of the screen is (0,0) in the isometric plane container
        const endX = (Math.random() - 0.5) * 400
        const endY = (Math.random() - 0.5) * 400
        
        return {
          id: `${d.id}-${Date.now()}-${i}`,
          value: d.value,
          color: data.color || '#ffffff',
          startX: endX + (Math.random() - 0.5) * 200,
          startY: endY + (Math.random() - 0.5) * 200,
          endX,
          endY
        }
      })
      
      setDiceList(prev => [...prev, ...newDice])
      
      // Cleanup after animation finishes (let them stay on board a bit longer)
      setTimeout(() => {
        setDiceList(prev => prev.filter(p => !newDice.find(n => n.id === p.id)))
      }, 4500)
    }

    EventBus.on('roll-dice-visual', handleRoll)
    return () => {
      EventBus.off('roll-dice-visual', handleRoll)
    }
  }, [])

  if (diceList.length === 0) return null

  return (
    <div 
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-visible" 
      style={{ perspective: '2500px' }}
    >
      {/* Plano Isométrico */}
      <div 
        className="absolute h-0 w-0"
        style={{ 
          transformStyle: 'preserve-3d',
          transform: 'rotateX(60deg) rotateZ(45deg)'
        }}
      >
        {diceList.map((d, i) => (
          <Dice3D key={d.id} data={d} delay={i * 30} />
        ))}
      </div>
    </div>
  )
}

function Dice3D({ data, delay }: { data: DiceData, delay: number }) {
  const [visible, setVisible] = useState(false)
  
  const wrapperRef = useRef<HTMLDivElement>(null)
  const diceRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)

  const refs = useMemo(() => ({
     wrapper: wrapperRef,
     dice: diceRef,
     shadow: shadowRef,
  }), [])

  useEffect(() => {
    // Determine target rotation based on dice value
    let rx = 0, ry = 0;
    switch (data.value) {
      case 1: rx = 0; ry = 0; break;
      case 6: rx = 180; ry = 0; break;
      case 2: rx = 0; ry = 90; break;
      case 5: rx = 0; ry = -90; break;
      case 3: rx = -90; ry = 0; break;
      case 4: rx = 90; ry = 0; break;
    }
    
    // Procedural Physics Path Generation
    const R_final = { x: rx, y: ry, z: Math.random() * 90 - 45 };
    const R_impact3 = { // small wobble on last settle
      x: R_final.x + (Math.random() * 40 - 20), 
      y: R_final.y + (Math.random() * 40 - 20), 
      z: R_final.z + (Math.random() * 20 - 10)
    };
    const R_impact2 = { // 90 deg roll
      x: R_impact3.x + (Math.random() > 0.5 ? 90 : -90) + (Math.random() * 30), 
      y: R_impact3.y + (Math.random() > 0.5 ? 90 : -90) + (Math.random() * 30), 
      z: R_impact3.z + 45 
    };
    const R_impact1 = { // heavy spin
      x: R_impact2.x + (Math.random() > 0.5 ? 180 : -180), 
      y: R_impact2.y + (Math.random() > 0.5 ? 180 : -180), 
      z: R_impact2.z + 90 
    };
    const R_start = { // fast spin in air
      x: R_impact1.x + (Math.random() > 0.5 ? 360 : -360), 
      y: R_impact1.y + (Math.random() > 0.5 ? 360 : -360), 
      z: R_impact1.z + 180 
    };

    const getRotation = (t: number) => {
       if (t < 0.3) {
         const p = t / 0.3; return { x: lerp(R_start.x, R_impact1.x, p), y: lerp(R_start.y, R_impact1.y, p), z: lerp(R_start.z, R_impact1.z, p) };
       }
       if (t < 0.7) {
         const p = (t - 0.3) / 0.4; return { x: lerp(R_impact1.x, R_impact2.x, p), y: lerp(R_impact1.y, R_impact2.y, p), z: lerp(R_impact1.z, R_impact2.z, p) };
       }
       if (t < 0.9) {
         const p = (t - 0.7) / 0.2; return { x: lerp(R_impact2.x, R_impact3.x, p), y: lerp(R_impact2.y, R_impact3.y, p), z: lerp(R_impact2.z, R_impact3.z, p) };
       }
       const p = (t - 0.9) / 0.1; return { x: lerp(R_impact3.x, R_final.x, p), y: lerp(R_impact3.y, R_final.y, p), z: lerp(R_impact3.z, R_final.z, p) };
    }

    const showTimer = setTimeout(() => {
      setVisible(true)
      
      const duration = 1200; // ms
      let startTime: number | null = null;
      let frameId: number;

      const animate = (time: number) => {
        if (!startTime) startTime = time;
        const elapsed = time - startTime;
        let t = elapsed / duration;
        if (t > 1) t = 1;

        // X, Y Translation
        const easeT = easeOutCubic(t);
        const currX = lerp(data.startX, data.endX, easeT);
        const currY = lerp(data.startY, data.endY, easeT);
        
        // Z Bounce (add 24px offset so the 48px tall dice sits on top of the floor instead of intersecting it)
        const zHeight = getBounceZ(t) * 800 + 24; 
        
        // Rotation
        const rot = getRotation(t);

        // Apply to DOM via refs for 60fps performance without React re-renders
        if (refs.wrapper.current) {
           refs.wrapper.current.style.transform = `translate3d(${currX}px, ${currY}px, ${zHeight}px) rotateZ(${rot.z}deg)`;
        }
        if (refs.dice.current) {
           refs.dice.current.style.transform = `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`;
        }
        if (refs.shadow.current) {
           // Shadow stays flat on the floor (no Z translation), scales and fades with Z height
           const shadowScale = lerp(1.2, 0.4, zHeight / 800);
           const shadowOpacity = lerp(0.8, 0.0, zHeight / 800);
           refs.shadow.current.style.transform = `translate3d(${currX}px, ${currY}px, 0)`;
           refs.shadow.current.style.opacity = `${shadowOpacity}`;
           refs.shadow.current.style.scale = `${shadowScale}`;
        }

        if (t < 1) {
          frameId = requestAnimationFrame(animate);
        }
      }
      
      // Initialize starting position
      if (refs.wrapper.current) refs.wrapper.current.style.transform = `translate3d(${data.startX}px, ${data.startY}px, 800px) rotateZ(${R_start.z}deg)`;
      if (refs.dice.current) refs.dice.current.style.transform = `rotateX(${R_start.x}deg) rotateY(${R_start.y}deg)`;
      
      frameId = requestAnimationFrame(animate);
      
      return () => cancelAnimationFrame(frameId);
    }, delay)
    
    return () => clearTimeout(showTimer)
  }, [data, delay, refs])

  if (!visible) return null

  const sZ = "24px" // Half of 48px (h-12 w-12)

  return (
    <>
      {/* Shadow layer (independent from wrapper so it stays on floor) */}
      <div 
        ref={refs.shadow}
        className="absolute left-[-24px] top-[-24px] h-12 w-12 rounded-full bg-black/60 blur-sm will-change-transform"
        style={{ opacity: 0 }}
      />
      
      {/* Main Physics Wrapper */}
      <div 
        ref={refs.wrapper}
        className="absolute left-[-24px] top-[-24px] h-12 w-12 will-change-transform"
        style={{ transformStyle: 'preserve-3d', opacity: 1 }}
      >
        <div 
          ref={refs.dice}
          className="absolute inset-0 will-change-transform"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Faces */}
          <Face color={data.color} transform={`translateZ(${sZ})`}>
            <Dot />
          </Face>
          <Face color={data.color} transform={`rotateX(180deg) translateZ(${sZ})`}>
            <div className="flex h-full w-full justify-between px-1.5 py-1">
               <div className="flex flex-col justify-between"><Dot/><Dot/><Dot/></div>
               <div className="flex flex-col justify-between"><Dot/><Dot/><Dot/></div>
            </div>
          </Face>
          <Face color={data.color} transform={`rotateY(-90deg) translateZ(${sZ})`}>
            <div className="flex h-full w-full justify-between p-1.5">
               <div className="self-start"><Dot/></div>
               <div className="self-end"><Dot/></div>
            </div>
          </Face>
          <Face color={data.color} transform={`rotateY(90deg) translateZ(${sZ})`}>
            <div className="flex h-full w-full justify-between p-1.5">
               <div className="flex flex-col justify-between"><Dot/><Dot/></div>
               <div className="self-center"><Dot/></div>
               <div className="flex flex-col justify-between"><Dot/><Dot/></div>
            </div>
          </Face>
          <Face color={data.color} transform={`rotateX(90deg) translateZ(${sZ})`}>
             <div className="flex h-full w-full justify-between p-1.5">
               <div className="self-start"><Dot/></div>
               <div className="self-center"><Dot/></div>
               <div className="self-end"><Dot/></div>
            </div>
          </Face>
          <Face color={data.color} transform={`rotateX(-90deg) translateZ(${sZ})`}>
             <div className="flex h-full w-full justify-between p-1.5">
               <div className="flex flex-col justify-between"><Dot/><Dot/></div>
               <div className="flex flex-col justify-between"><Dot/><Dot/></div>
            </div>
          </Face>
        </div>
      </div>
    </>
  )
}

function Face({ color, transform, children }: { color: string, transform: string, children: React.ReactNode }) {
  return (
    <div 
      className="absolute flex h-full w-full items-center justify-center rounded-lg border-2 border-white/20 bg-opacity-95 shadow-[inset_0_0_20px_rgba(255,255,255,0.6)] overflow-hidden"
      style={{ 
        transform, 
        backgroundColor: color,
        backfaceVisibility: 'hidden',
        boxShadow: 'inset 0 0 15px rgba(0,0,0,0.3), inset 0 0 5px rgba(255,255,255,0.8)'
      }}
    >
      {children}
    </div>
  )
}

function Dot() {
  return <div className="h-2 w-2 rounded-full bg-white shadow-sm" />
}
