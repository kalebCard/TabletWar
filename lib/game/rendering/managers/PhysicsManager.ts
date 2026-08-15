import { Terrain } from "../../types";

function pointInPolygon(point: {x: number, y: number}, polygon: {x: number, y: number}[]) {
    let isInside = false;
    let i = 0, j = polygon.length - 1;
    for (; i < polygon.length; j = i++) {
        if ( (polygon[i].y > point.y) != (polygon[j].y > point.y) &&
             point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x ) {
            isInside = !isInside;
        }
    }
    return isInside;
}

export class PhysicsManager {
    static getElevationInfo(x: number, y: number, terrain: Terrain[]): { z: number, terrainId: string | null } {
        let maxZ = 0;
        let tId: string | null = null;
        terrain.forEach(t => {
            if (t.platforms && t.platforms.length > 0) {
                const footprint = t.platforms[0].points || t.points;
                const polygon = footprint.map(p => ({ x: p.x, y: p.y }));
                if (pointInPolygon({ x, y }, polygon)) {
                    t.platforms.forEach(plat => {
                        if (plat.height > maxZ) {
                            maxZ = plat.height;
                            tId = t.id;
                        }
                    });
                }
            }
        });
        return { z: maxZ, terrainId: tId };
    }

    static resolveWallCollisions(wx: number, wy: number, z: number, radius: number, terrain: Terrain[]): { x: number, y: number } {
        let px = wx;
        let py = wy;

        terrain.forEach(ter => {
            // Only solid objects block movement
            if (ter.type !== "obscuring" && ter.type !== "cover" && ter.label !== "Muro" && ter.label !== "Barril") return;

            const pts = ter.points;
            if (!pts || pts.length < 2) return;

            for (let i = 0; i < pts.length; i++) {
                const nextI = (i + 1) % pts.length;
                const p1 = pts[i];
                const p2 = pts[nextI];
                
                const z1 = ter.zHeights ? ter.zHeights[i] : (ter.height || 0);
                const z2 = ter.zHeights ? ter.zHeights[nextI] : (ter.height || 0);
                const wallH = Math.min(z1, z2);
                
                // If the token is above the wall or wall doesn't exist, it doesn't collide
                if (wallH <= 0 || z >= wallH) continue;

                // Line segment closest point
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len2 = dx * dx + dy * dy;
                if (len2 === 0) continue; 

                const t = Math.max(0, Math.min(1, ((px - p1.x) * dx + (py - p1.y) * dy) / len2));
                const closestX = p1.x + t * dx;
                const closestY = p1.y + t * dy;

                const distSq = (px - closestX) * (px - closestX) + (py - closestY) * (py - closestY);
                if (distSq < radius * radius && distSq > 0) {
                    const dist = Math.sqrt(distSq);
                    const push = radius - dist;
                    const nx = (px - closestX) / dist;
                    const ny = (py - closestY) / dist;
                    
                    px += nx * push;
                    py += ny * push;
                }
            }
        });
        
        return { x: px, y: py };
    }
}
