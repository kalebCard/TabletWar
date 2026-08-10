import { Token } from './types';

/**
 * Roll a standard 6-sided die (D6).
 * @returns A random number between 1 and 6.
 */
export function rollD6(): number {
    return Math.floor(Math.random() * 6) + 1;
}

/**
 * Roll multiple 6-sided dice.
 * @param count Number of dice to roll.
 * @returns Array of individual dice results.
 */
export function rollMultipleD6(count: number): number[] {
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(rollD6());
    }
    return results;
}

/**
 * Calculate the true distance in inches between two tokens, 
 * accounting for their base sizes.
 * 
 * @param t1 The first token
 * @param t2 The second token
 * @returns The distance in inches from base edge to base edge. Returns 0 if bases overlap.
 */
export function getDistanceBetweenTokens(t1: Token, t2: Token): number {
    const centerDistance = Math.hypot(t1.x - t2.x, t1.y - t2.y);
    
    // Convert base sizes from mm to inches (1 inch = 25.4 mm)
    const radius1 = (t1.baseMm / 25.4) / 2;
    const radius2 = (t2.baseMm / 25.4) / 2;
    
    // The true distance is between their edges
    const edgeDistance = centerDistance - radius1 - radius2;
    
    // Ensure distance is not negative (e.g., if models overlap)
    return Math.max(0, edgeDistance);
}
