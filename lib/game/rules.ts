import { Token, Unit } from "./types"
import { getDistanceBetweenTokens } from "./utils"

/**
 * Verifica si una unidad puede embarcar en algún transporte aliado disponible.
 * Según las reglas, todos los modelos de la unidad deben estar a 3" o menos de al menos un modelo del transporte.
 */
export function canUnitEmbark(
  selectedUnit: Unit,
  tokens: Token[],
  units: Unit[]
): boolean {
  if (!selectedUnit || selectedUnit.transportCapacity) return false

  const unitTokens = tokens.filter(t => t.unitId === selectedUnit.id && t.currentWounds > 0)
  if (unitTokens.length === 0) return false

  const alliedTransports = units.filter(
    tr => tr.faction === selectedUnit.faction && tr.transportCapacity && tr.transportCapacity > 0
  )

  for (const transport of alliedTransports) {
    const transportTokens = tokens.filter(t => t.unitId === transport.id)
    if (transportTokens.length > 0) {
      const transportToken = transportTokens[0] // Asumimos un solo token por transporte
      
      const allWithin3 = unitTokens.every(t => getDistanceBetweenTokens(t, transportToken) <= 3)
      if (allWithin3) {
        return true
      }
    }
  }

  return false
}

/**
 * Verifica si unas coordenadas de despliegue son válidas para la facción según el layout de la mesa.
 */
export function isValidDeploymentPosition(
  faction: string,
  x: number,
  terrainLayout: string
): { valid: boolean, errorMessage?: string } {
  const gridWidth = terrainLayout === 'combat-patrol' ? 44 : 60

  if (faction === "imperium" && x > 10.5) {
    return { valid: false, errorMessage: "⚠️ ¡El Imperio debe desplegar dentro de su Zona de Despliegue! (Primeras 10\" en la izquierda del mapa)" }
  }
  
  if (faction === "chaos" && x < gridWidth - 10.5) {
    return { valid: false, errorMessage: `⚠️ ¡El Caos debe desplegar dentro de su Zona de Despliegue! (Últimas 10" en la derecha del mapa)` }
  }

  return { valid: true }
}

/**
 * Verifica si una unidad está dentro del rango de engagement (1") de alguna unidad enemiga.
 */
export function isUnitInEngagementRange(
  selectedToken: Token,
  tokens: Token[]
): boolean {
  if (!selectedToken) return false
  return tokens.some(
    t => t.faction !== selectedToken.faction && 
    t.currentWounds > 0 && 
    getDistanceBetweenTokens(t, selectedToken) <= 1.0
  )
}
