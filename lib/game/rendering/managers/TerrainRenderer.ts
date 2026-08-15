import Phaser from 'phaser';
import type { BoardScene } from '../../BoardScene';

export class TerrainRenderer {
    private scene: BoardScene;

    constructor(scene: BoardScene) {
        this.scene = scene;
    }

    public generateNoiseTexture() {
        if (!this.scene.textures.exists('simple_battlemat')) {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                ctx.fillStyle = '#16181a';
                ctx.fillRect(0, 0, size, size);
                
                const imgData = ctx.getImageData(0, 0, size, size);
                const data = imgData.data;
                
                for (let i = 0; i < data.length; i += 4) {
                    const noise = (Math.random() - 0.5) * 14; 
                    data[i] = Math.min(255, Math.max(0, 22 + noise));     // R
                    data[i+1] = Math.min(255, Math.max(0, 24 + noise));   // G
                    data[i+2] = Math.min(255, Math.max(0, 26 + noise));   // B
                    data[i+3] = 255;                                      // A
                }
                ctx.putImageData(imgData, 0, 0);
            }
            this.scene.textures.addCanvas('simple_battlemat', canvas);
        }
    }

    public drawGrid() {
        if (!this.scene.add) return;
        if (!this.scene.gridGraphics) {
            this.scene.gridGraphics = this.scene.add.graphics();
        }
        this.scene.gridGraphics.clear();
        this.scene.gridGraphics.lineStyle(1, 0x00f2fe, 0.15); 

        for (let x = 0; x <= this.scene.gridWidth; x++) {
            const p1 = this.scene.getIsoPoint(x, 0);
            const p2 = this.scene.getIsoPoint(x, this.scene.gridHeight);
            this.scene.gridGraphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
        }

        for (let y = 0; y <= this.scene.gridHeight; y++) {
            const p1 = this.scene.getIsoPoint(0, y);
            const p2 = this.scene.getIsoPoint(this.scene.gridWidth, y);
            this.scene.gridGraphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
        }
        
        this.scene.gridGraphics.setPosition(this.scene.cameras.main.width / 2, 200);
    }

    public redrawTerrain() {
        if (!this.scene.add || !this.scene.cameras || !this.scene.cameras.main || this.scene.cameras.main.width <= 0 || this.scene.cameras.main.height <= 0) return;

        this.scene.terrainGraphicsMap.forEach((g: any) => {
            if (g.back && g.back.scene) g.back.destroy();
            if (g.front && g.front.scene) g.front.destroy();
        });
        this.scene.terrainGraphicsMap.clear();
        
        if (this.scene.shadowGraphics) {
            this.scene.shadowGraphics.clear();
        }

        this.scene.terrain.forEach((ter: any) => {
            const backG = this.scene.add.graphics();
            const frontG = this.scene.add.graphics();

            const pts = ter.points.map((p: { x: number, y: number }) => {
                const iso = this.scene.getIsoPoint(p.x, p.y);
                return { 
                    worldX: p.x, 
                    worldY: p.y, 
                    x: iso.x + this.scene.cameras.main.width / 2, 
                    y: iso.y + 200 
                };
            });
            
            if (this.scene.shadowGraphics) {
                const shadowOffsetX = 20;
                const shadowOffsetY = 10;
                this.scene.shadowGraphics.fillStyle(0x000000, 0.35);
                this.scene.shadowGraphics.beginPath();
                this.scene.shadowGraphics.moveTo(pts[0].x + shadowOffsetX, pts[0].y + shadowOffsetY);
                for (let i = 1; i < pts.length; i++) {
                    this.scene.shadowGraphics.lineTo(pts[i].x + shadowOffsetX, pts[i].y + shadowOffsetY);
                }
                this.scene.shadowGraphics.closePath();
                this.scene.shadowGraphics.fill();
            }
            
            let min_sy = Infinity;
            let max_sy = -Infinity;
            let cx = 0;
            let cy = 0;
            let worldCx = 0;
            let worldCy = 0;
            pts.forEach((p: any) => {
                if (p.y < min_sy) min_sy = p.y;
                if (p.y > max_sy) max_sy = p.y;
                cx += p.x;
                cy += p.y;
                worldCx += p.worldX;
                worldCy += p.worldY;
            });
            cx /= pts.length;
            cy /= pts.length;
            worldCy /= pts.length;
            
            const height = ter.height !== undefined ? ter.height : (ter.type === "obscuring" ? 80 : (ter.label === "Bosque" ? 40 : 10));

            this.scene.terrainGraphicsMap.set(ter.id, { back: backG, front: frontG, max_sy, height });
            backG.setDepth(min_sy - 1);
            frontG.setDepth(max_sy + 1);
            
            backG.fillStyle(0x0a0815, 1.0); 
            backG.lineStyle(1, 0x00000, 0.8);
            backG.beginPath();
            backG.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) backG.lineTo(pts[i].x, pts[i].y);
            backG.closePath();
            backG.fill();

            interface Wall { p1: any, p2: any, midY: number, isInner: boolean, z1: number, z2: number }
            const walls: Wall[] = [];
            for (let i = 0; i < pts.length; i++) {
                const prevI = (i - 1 + pts.length) % pts.length;
                const nextI = (i + 1) % pts.length;
                const nextNextI = (i + 2) % pts.length;
                
                const cp_i = (pts[i].worldX - pts[prevI].worldX) * (pts[nextI].worldY - pts[i].worldY) - (pts[i].worldY - pts[prevI].worldY) * (pts[nextI].worldX - pts[i].worldX);
                const cp_next = (pts[nextI].worldX - pts[i].worldX) * (pts[nextNextI].worldY - pts[nextI].worldY) - (pts[nextI].worldY - pts[i].worldY) * (pts[nextNextI].worldX - pts[nextI].worldX);
                
                const isInner = cp_i < -0.01 || cp_next < -0.01;

                walls.push({
                    p1: pts[i],
                    p2: pts[nextI],
                    midY: (pts[i].y + pts[nextI].y) / 2,
                    isInner,
                    z1: ter.zHeights ? ter.zHeights[i] : height,
                    z2: ter.zHeights ? ter.zHeights[nextI] : height
                });
            }
            
            walls.sort((a, b) => a.midY - b.midY);

            for (const w of walls) {
                const { p1, p2, z1, z2 } = w;
                
                if (z1 === 0 && z2 === 0) continue;
                
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx*dx + dy*dy) || 1;
                const ny = -dx / len;
                let isFront = (ny > -0.01); 
                
                if (w.isInner) {
                    isFront = false;
                }
                
                const g = isFront ? frontG : backG;
                
                const nx = dy / len; 
                
                const wdx = p2.worldX - p1.worldX;
                const wdy = p2.worldY - p1.worldY;
                const wlen = Math.sqrt(wdx * wdx + wdy * wdy) || 1;
                const wnx = wdy / wlen;
                const wny = -wdx / wlen;
                const lightDot = (wnx * -0.707 + wny * -0.707 + 1) / 2; 
                const light = Math.max(0, Math.min(1, lightDot));
                
                let baseHex = 0x211b3d; 
                let shadowHex = 0x0a0614; 
                if (ter.type === "obscuring") { baseHex = 0x1e1a35; shadowHex = 0x080510; }
                else if (ter.label === "Bosque") { baseHex = 0x1a0b17; shadowHex = 0x0a0810; }
                
                const isShadowFace = light < 0.5;
                const faceHex = isShadowFace ? shadowHex : baseHex;
                const shade = isShadowFace ? 0.3 + light * 0.4 : 0.7 + light * 0.3;
                const baseColor = Phaser.Display.Color.ValueToColor(faceHex);
                const finalColor = Phaser.Display.Color.GetColor(
                    Math.min(255, Math.floor(baseColor.red * shade)),
                    Math.min(255, Math.floor(baseColor.green * shade)),
                    Math.min(255, Math.floor(baseColor.blue * shade))
                );
                
                g.fillStyle(finalColor, 1.0);
                const outlineWidth = isShadowFace ? 2 : 1;
                const outlineAlpha = isShadowFace ? 1.0 : 0.6;
                g.lineStyle(outlineWidth, 0x000000, outlineAlpha);
                
                g.beginPath();
                g.moveTo(p1.x, p1.y);
                g.lineTo(p2.x, p2.y);
                g.lineTo(p2.x, p2.y - z2);
                g.lineTo(p1.x, p1.y - z1);
                g.closePath();
                g.fill();
                g.strokePath();
                
                if (ter.type === "obscuring" && z1 === z2 && z1 >= 40) {
                    const windowWidth = 20; 
                    const pillarWidth = 10;
                    const unit = windowWidth + pillarWidth;
                    const count = Math.floor(wlen / unit);
                    
                    const floorHeight = 40; 
                    const floors = Math.floor(height / floorHeight);
                    
                    const highlightColor = 0x00f2fe; 
                    const shadowColor = 0x050114;
                    
                    for (let f = 0; f < floors; f++) {
                        const zBase = f * floorHeight + 5;
                        const zTop = zBase + 20;
                        const zPeak = zTop + 10;
                        
                        for (let i = 0; i < count; i++) {
                            const offset = (wlen - (count * unit)) / 2;
                            const uStart = offset + i * unit + (pillarWidth / 2);
                            
                            const t1 = uStart / wlen;
                            const t2 = (uStart + windowWidth) / wlen;
                            const tMid = (uStart + windowWidth / 2) / wlen;
                            
                            const wx1 = p1.x + dx * t1;
                            const wy1 = p1.y + dy * t1;
                            const wx2 = p1.x + dx * t2;
                            const wy2 = p1.y + dy * t2;
                            const wmidX = p1.x + dx * tMid;
                            const wmidY = p1.y + dy * tMid;
                            
                            g.fillStyle(shadowColor, 0.9);
                            g.beginPath();
                            g.moveTo(wx1, wy1 - zBase);
                            g.lineTo(wx2, wy2 - zBase);
                            g.lineTo(wmidX, wmidY - zTop); 
                            g.lineTo(wx1, wy1 - zTop);
                            g.closePath();
                            g.fill();
                            
                            g.lineStyle(1, highlightColor, 0.8);
                            g.strokePath();
                            
                            g.lineStyle(2, 0xff00ff, 0.6); 
                            g.beginPath();
                            g.moveTo(wmidX, wmidY - zBase - 2);
                            g.lineTo(wmidX, wmidY - zTop + 2);
                            g.strokePath();
                            const tW = 5 / wlen; 
                            const px1 = p1.x + dx * (tMid - tW);
                            const py1 = p1.y + dy * (tMid - tW);
                            const px2 = p1.x + dx * (tMid + tW);
                            const py2 = p1.y + dy * (tMid + tW);
                            
                            g.fillStyle(0x00f2fe, 0.7); 
                            g.beginPath();
                            g.moveTo(px1, py1 - zBase + 2);
                            g.lineTo(px2, py2 - zBase + 2);
                            g.lineTo(px2, py2 - zBase + 4);
                            g.lineTo(px1, py1 - zBase + 4);
                            g.closePath();
                            g.fill();
                            
                            g.lineStyle(1, shadowColor, 0.9);
                            for (let slit = 0; slit < 3; slit++) {
                                const zs = zTop - 2 - slit * 2;
                                g.beginPath();
                                g.moveTo(px1, py1 - zs);
                                g.lineTo(px2, py2 - zs);
                                g.strokePath();
                            }
                        }
                        
                        if (f > 0) {
                            const zLedge = f * floorHeight;
                            g.lineStyle(2, 0xff00ff, 0.7); 
                            g.beginPath();
                            g.moveTo(p1.x, p1.y - zLedge);
                            g.lineTo(p2.x, p2.y - zLedge);
                            g.strokePath();
                        }
                    }
                    
                    for (let i = 0; i <= count; i++) {
                        const offset = (wlen - (count * unit)) / 2;
                        const uCenter = offset + i * unit - (pillarWidth / 2);
                        if (uCenter >= 0 && uCenter <= wlen) {
                            const t = uCenter / wlen;
                            const px = p1.x + dx * t;
                            const py = p1.y + dy * t;
                            
                            g.lineStyle(2, highlightColor, 0.4);
                            g.beginPath();
                            g.moveTo(px, py);
                            g.lineTo(px, py - height);
                            g.strokePath();
                        }
                    }
                } else if (ter.label === "Barril") {
                    const barrelHighlight = 0x00ff00; 
                    const barrelDark = 0x113311;
                    
                    g.lineStyle(2, barrelHighlight, 0.8);
                    
                    for (let z = 3; z <= height - 3; z += 5) {
                        g.beginPath();
                        g.moveTo(p1.x, p1.y - z);
                        g.lineTo(p2.x, p2.y - z);
                        g.strokePath();
                    }
                    
                    g.lineStyle(1, barrelDark, 0.6);
                    g.beginPath();
                    g.moveTo(p1.x + dx*0.3, p1.y + dy*0.3);
                    g.lineTo(p1.x + dx*0.3, p1.y + dy*0.3 - height);
                    g.strokePath();
                } else if (ter.type === "cover") {
                    const highlightColor = 0xff00ff; 
                    
                    g.lineStyle(2, highlightColor, 0.8);
                    g.beginPath();
                    g.moveTo(p1.x, p1.y);
                    g.lineTo(p2.x, p2.y - height);
                    g.moveTo(p1.x, p1.y - height);
                    g.lineTo(p2.x, p2.y);
                    g.strokePath();
                    
                    const cx = (p1.x + p2.x) / 2;
                    const cy = (p1.y + p2.y) / 2;
                    const zc = height / 2;
                    g.fillStyle(0x00f2fe, 0.9);
                    g.beginPath();
                    g.moveTo(cx - 3, cy - zc - 3);
                    g.lineTo(cx + 3, cy - zc - 3);
                    g.lineTo(cx + 3, cy - zc + 3);
                    g.lineTo(cx - 3, cy - zc + 3);
                    g.closePath();
                    g.fill();
                    
                    g.lineStyle(2, highlightColor, 0.8);
                    g.beginPath();
                    g.moveTo(p1.x, p1.y - 2);
                    g.lineTo(p2.x, p2.y - 2);
                    g.moveTo(p1.x, p1.y - height + 2);
                    g.lineTo(p2.x, p2.y - height + 2);
                    g.strokePath();
                } else if (ter.label === "Bosque") {
                    const treeCount = Math.floor(wlen / 25);
                    g.lineStyle(3, 0x00f2fe, 0.6);
                    for(let i=1; i<treeCount; i++) {
                        const t = i / treeCount;
                        const px = p1.x + dx * t;
                        const py = p1.y + dy * t;
                        g.beginPath();
                        g.moveTo(px, py);
                        g.lineTo(px + 10, py - height/2);
                        g.lineTo(px, py - height);
                        g.strokePath();
                    }
                } else if (ter.platforms) {
                    ter.platforms.forEach((plat: any) => {
                        const platHeight = plat.height;
                        if (platHeight > 0 && platHeight < height) {
                            g.beginPath();
                            g.moveTo(p1.x, p1.y - platHeight);
                            g.lineTo(p2.x, p2.y - platHeight);
                            g.lineStyle(3, 0x2b947f, 0.8);
                            g.strokePath();
                        }
                    });
                }
            }

            if (ter.platforms) {
                const floors = [...ter.platforms];
                floors.sort((a, b) => a.height - b.height);
                
                floors.forEach(plat => {
                    const platHeight = plat.height;
                    if (plat.points) { 
                        const floorPts = plat.points.map((p: any) => {
                            const iso = this.scene.getIsoPoint(p.x, p.y);
                            return { x: iso.x + this.scene.cameras.main.width / 2, y: iso.y + 200 };
                        });
                        
                        const floorColor = ter.type === "obscuring" ? 0x161329 : (ter.label === "Bosque" ? 0x1a0b17 : 0x211b3d);
                        backG.fillStyle(floorColor, 1.0); 
                        backG.lineStyle(2, 0x00f2fe, 0.8); 
                        
                        backG.beginPath();
                        backG.moveTo(floorPts[0].x, floorPts[0].y - platHeight);
                        for (let i = 1; i < floorPts.length; i++) backG.lineTo(floorPts[i].x, floorPts[i].y - platHeight);
                        backG.closePath();
                        backG.fill();
                        backG.strokePath();
                        
                        backG.lineStyle(1, 0x00f2fe, 0.2);
                        const numHexes = 3;
                        for (let i = 0; i < floorPts.length; i++) {
                            const pA = floorPts[i];
                            const pB = floorPts[(i + 1) % floorPts.length];
                            backG.beginPath();
                            backG.moveTo(pA.x, pA.y - platHeight);
                            backG.lineTo((pA.x + pB.x)/2, (pA.y + pB.y)/2 - platHeight + 10);
                            backG.strokePath();
                        }
                    }
                });
            }

            const topColor = ter.type === "obscuring" ? 0x2f4a6e : (ter.label === "Bosque" ? 0x2a4838 : 0x3a3a5c);
            frontG.fillStyle(topColor, 1.0);
            frontG.lineStyle(1, 0x000000, 0.8);
            frontG.beginPath();
            const z0 = ter.zHeights ? ter.zHeights[0] : height;
            frontG.moveTo(pts[0].x, pts[0].y - z0);
            for (let i = 1; i < pts.length; i++) {
                const zi = ter.zHeights ? ter.zHeights[i] : height;
                frontG.lineTo(pts[i].x, pts[i].y - zi);
            }
            frontG.closePath();
            frontG.fill();
            frontG.strokePath();
            
            frontG.lineStyle(2, 0x6080b0, 0.5);
            frontG.beginPath();
            frontG.moveTo(pts[0].x, pts[0].y - z0);
            frontG.lineTo(pts[1 % pts.length].x, pts[1 % pts.length].y - (ter.zHeights ? ter.zHeights[1 % pts.length] : height));
            frontG.strokePath();

            const hitPoly = pts.map(p => ({ x: p.x, y: p.y - (ter.zHeights ? ter.zHeights[0] : height) }));
            frontG.setInteractive(new Phaser.Geom.Polygon(hitPoly), Phaser.Geom.Polygon.Contains);
            frontG.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                if (this.scene.gameState?.phase === 'roster') {
                    this.scene.draggingTerrain = {
                        id: ter.id,
                        startWorldX: pointer.worldX,
                        startWorldY: pointer.worldY,
                        frontG,
                        backG
                    };
                }
            });
        });
    }
}
