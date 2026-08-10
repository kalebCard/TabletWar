import Phaser from 'phaser';
import { EventBus } from './EventBus';
import { BOARD_WIDTH_IN, BOARD_HEIGHT_IN, DATASHEETS } from './constants';
import { GameState, Token, Terrain, Unit } from './types';
import { getObjectivesForLayout } from './constants';

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

export class BoardScene extends Phaser.Scene {
    private gridWidth = 60;
    private gridHeight = 44;
    private tileWidth = 32; // scale factor for X
    private tileHeight = 16; // scale factor for Y
    
    // 3D Camera Rotation (Yaw) & Smoothing Targets
    public cameraYaw = 0;
    public targetScrollX = 0;
    public targetScrollY = 0;
    public targetZoom = 1.0;
    public targetYaw = 0;

    // Game state references
    private gameState: GameState | null = null;
    private tokens: Token[] = [];
    private units: Unit[] = [];
    private terrain: Terrain[] = [];
    private combatQueue: any[] = [];
    
    // Phaser groups
    private tokenSprites!: Phaser.GameObjects.Group;
    private terrainGraphicsMap: Map<string, { back: Phaser.GameObjects.Graphics, front: Phaser.GameObjects.Graphics, max_sy: number, height: number }> = new Map();
    private shadowGraphics: Phaser.GameObjects.Graphics | null = null;
    private gridGraphics: Phaser.GameObjects.Graphics | null = null;
    private matContainer: Phaser.GameObjects.Container | null = null;
    private matImage: Phaser.GameObjects.Image | null = null;
    
    // Interaction
    private draggingToken: Phaser.GameObjects.Sprite | null = null;
    private dragStartWorld: { x: number, y: number } | null = null;
    private dragStartElevation: number = 0;
    private draggingTerrain: { id: string, startWorldX: number, startWorldY: number, frontG: Phaser.GameObjects.Graphics, backG: Phaser.GameObjects.Graphics } | null = null;
    private measurementLine!: Phaser.GameObjects.Graphics;
    private measurementText!: Phaser.GameObjects.Text;
    private objectiveGraphics!: Phaser.GameObjects.Graphics;
    private deploymentGraphics!: Phaser.GameObjects.Graphics;
    private queuedAttackLines!: Phaser.GameObjects.Graphics;
    private measureStartWorld: { x: number, y: number } | null = null;
    private marqueeGraphics!: Phaser.GameObjects.Graphics;
    private marqueeStartWorld: { x: number, y: number } | null = null;

    // Deployment ghost preview & teleport animation
    private ghostContainer: Phaser.GameObjects.Container | null = null;
    private deployingUnitId: string | null = null;
    private hoverTimer: number = 0;
    private selectedIds: string[] = [];
    
    // Multi-dragging
    private dragGroup: { sprite: Phaser.GameObjects.Sprite, startWorldX: number, startWorldY: number, startZ: number }[] | null = null;
    private isMeasuringMode = false;
    private isMultiSelectMode = false;
    private prevPhase: string | null = null;

    // Keys
    private keyQ?: Phaser.Input.Keyboard.Key;
    private keyE?: Phaser.Input.Keyboard.Key;
    private keyW?: Phaser.Input.Keyboard.Key;
    private keyA?: Phaser.Input.Keyboard.Key;
    private keyS?: Phaser.Input.Keyboard.Key;
    private keyD?: Phaser.Input.Keyboard.Key;

    constructor() {
        super('BoardScene');
    }

    preload() {
        // Load assets
        this.load.image('battlemat', '/assets/battlemat_topdown.png');
        this.load.image('raw_token_imperium', '/assets/token_imperium.png');
        this.load.image('raw_token_chaos', '/assets/token_chaos.png');
        
        // Load per-unit miniature images
        DATASHEETS.forEach(ds => {
            if (ds.image) {
                this.load.image(`raw_mini_${ds.id}`, ds.image);
            }
        });
    }

    create() {
        // Pre-process green screen images to create transparent tokens
        this.createTransparentTexture('raw_token_imperium', 'token_imperium');
        this.createTransparentTexture('raw_token_chaos', 'token_chaos');
        
        // Pre-process miniature images
        DATASHEETS.forEach(ds => {
            if (ds.image) {
                this.createTransparentTexture(`raw_mini_${ds.id}`, `mini_${ds.id}`);
            }
        });
        
        // Generate simple ambient noise texture
        this.generateNoiseTexture();

        // Center camera
        this.cameras.main.setBackgroundColor('#050114');
        
        this.shadowGraphics = this.add.graphics();
        this.shadowGraphics.setDepth(-10); // Below all terrain but above grid
        this.cameras.main.setZoom(1.0);
        
        // Setup Battlemat
        // The grid's center is offset in the isometric projection by (cx - cy)*32, (cx + cy)*16
        // cx = 30, cy = 22 -> offsetX = 256, offsetY = 832
        const offsetX = (this.gridWidth / 2 - this.gridHeight / 2) * this.tileWidth;
        const offsetY = (this.gridWidth / 2 + this.gridHeight / 2) * this.tileHeight;
        this.matContainer = this.add.container(this.cameras.main.width / 2 + offsetX, 200 + offsetY);
        this.matContainer.setDepth(-1000);
        this.matContainer.scaleY = this.tileHeight / this.tileWidth; // Isometric squish
        
        this.matImage = this.add.image(0, 0, 'simple_battlemat');
        const diagScale = Math.SQRT2;
        this.matImage.setDisplaySize(this.gridWidth * this.tileWidth * diagScale, this.gridHeight * this.tileWidth * diagScale);
        this.matImage.setAlpha(0.6); // Slightly more opaque since it's a simple texture
        this.matContainer.add(this.matImage);

        // Draw Isometric Grid Base
        this.drawGrid();

        this.tokenSprites = this.add.group();

        // Listen for React updates
        EventBus.on('sync-state', (state: { game: GameState, tokens: Token[], units?: Unit[], terrain: Terrain[], combatQueue?: any[], deployingUnitId?: string | null, selectedIds?: string[] }) => {
            const prevPhase = this.prevPhase;
            const prevLayout = this.gameState?.terrainLayout;
            this.gameState = state.game;
            this.selectedIds = state.selectedIds || [];
            this.prevPhase = state.game.phase;
            this.tokens = state.tokens;
            this.units = state.units || [];
            this.terrain = state.terrain;
            this.combatQueue = state.combatQueue || [];
            this.deployingUnitId = state.deployingUnitId || null;
            if (!this.deployingUnitId && this.ghostContainer) {
                this.ghostContainer.setVisible(false);
            }
            
            const isCombatPatrol = state.game.terrainLayout === 'combat-patrol';
            const targetWidth = isCombatPatrol ? 44 : 60;
            const targetHeight = isCombatPatrol ? 30 : 44;
            
            if (this.gridWidth !== targetWidth || this.gridHeight !== targetHeight || prevLayout !== state.game.terrainLayout) {
                this.gridWidth = targetWidth;
                this.gridHeight = targetHeight;
                if (this.matImage) {
                    const diagScale = Math.SQRT2;
                    this.matImage.setDisplaySize(this.gridWidth * this.tileWidth * diagScale, this.gridHeight * this.tileWidth * diagScale);
                }
                this.updateBoardRender();
            } else {
                // Only do standard redraws if layout didn't change (updateBoardRender handles these otherwise)
                this.redrawTerrain();
                this.drawDeploymentZones();
                this.drawObjectives();
            }

            // Deployment intro animation when transitioning from roster to deployment
            if (prevPhase === 'roster' && state.game.phase === 'deployment') {
                this.playDeploymentIntroAnimation();
            }
            this.redrawTokens();
        });

        EventBus.on('sync-ui-modes', (data: { isMeasuring?: boolean, isMultiSelectMode?: boolean }) => {
            this.isMeasuringMode = !!data.isMeasuring;
            this.isMultiSelectMode = !!data.isMultiSelectMode;
            if (!this.isMeasuringMode && this.measurementLine && this.measurementText) {
                this.measurementLine.clear();
                this.measurementText.setVisible(false);
            }
        });

        // Disable context menu so right click panning works smoothly
        this.input.mouse?.disableContextMenu();
        this.measurementLine = this.add.graphics();
        this.measurementLine.setDepth(9999);
        
        this.queuedAttackLines = this.add.graphics();
        this.queuedAttackLines.setDepth(9998);
        
        this.measurementText = this.add.text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#00ff00',
            backgroundColor: '#000000AA',
            padding: { x: 6, y: 4 }
        });
        this.measurementText.setDepth(10000);
        this.measurementText.setVisible(false);

        // Handle Map Clicks
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown() && pointer.event?.ctrlKey) {
                this.measureStartWorld = this.getWorldPoint(pointer.worldX, pointer.worldY);
            }
            if (pointer.leftButtonDown() && pointer.event?.shiftKey) {
                this.marqueeStartWorld = { x: pointer.worldX, y: pointer.worldY };
            }
        });

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
            if (this.draggingTerrain) {
                const currentWorld = this.getWorldPoint(pointer.worldX, pointer.worldY);
                const startWorld = this.getWorldPoint(this.draggingTerrain.startWorldX, this.draggingTerrain.startWorldY);
                const dx = currentWorld.x - startWorld.x;
                const dy = currentWorld.y - startWorld.y;
                EventBus.emit('ui-move-terrain', [{ id: this.draggingTerrain.id, dx, dy }]);
                this.draggingTerrain = null;
                return;
            }

            if (this.measureStartWorld) {
                this.measureStartWorld = null;
                this.measurementLine?.clear();
                this.measurementText?.setVisible(false);
            }

            if (this.marqueeStartWorld) {
                const dist = Math.hypot(pointer.worldX - this.marqueeStartWorld.x, pointer.worldY - this.marqueeStartWorld.y);
                if (dist > 10) {
                    const rect = new Phaser.Geom.Rectangle(
                        Math.min(this.marqueeStartWorld.x, pointer.worldX),
                        Math.min(this.marqueeStartWorld.y, pointer.worldY),
                        Math.abs(pointer.worldX - this.marqueeStartWorld.x),
                        Math.abs(pointer.worldY - this.marqueeStartWorld.y)
                    );
                    
                    const selectedIds: string[] = [];
                    this.tokenSprites.getChildren().forEach((child) => {
                        const sprite = child as Phaser.GameObjects.Sprite;
                        if (Phaser.Geom.Rectangle.Contains(rect, sprite.x, sprite.y)) {
                            selectedIds.push(sprite.getData('tokenId'));
                        }
                    });
                    
                    if (selectedIds.length > 0) {
                        EventBus.emit('ui-select', selectedIds);
                    }
                }
                this.marqueeStartWorld = null;
                this.marqueeGraphics.clear();
            }

            if (pointer.rightButtonReleased() || pointer.middleButtonReleased()) return;
            // Check if it was a click and not a drag (increase threshold for mobile touch taps)
            const tapThreshold = pointer.wasTouch ? 15 : 5;
            if (Math.abs(pointer.downX - pointer.upX) < tapThreshold && Math.abs(pointer.downY - pointer.upY) < tapThreshold) {
                if (gameObjects.length === 0) {
                    const worldPt = this.getWorldPoint(pointer.worldX, pointer.worldY);
                    EventBus.emit('ui-map-click', worldPt);
                }
            }
        });

        // Multi-touch support for mobile devices
        this.input.addPointer(2);

        // Track last pinch distance and angle for 2-finger mobile zoom, pan & twist rotation
        let lastMid: { x: number, y: number } | null = null;
        let lastPinchDist = 0;
        let lastPinchAngle = 0;

        // Setup camera controls
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            // 2-finger touch gesture: Zoom, Pan & Twist Rotation for mobile
            if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
                const p1 = this.input.pointer1;
                const p2 = this.input.pointer2;

                const currentMidX = (p1.x + p2.x) / 2;
                const currentMidY = (p1.y + p2.y) / 2;
                const currentDist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
                const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

                if (lastMid && lastPinchDist > 0) {
                    // 1. Pan movement using exact midpoint difference
                    const midDx = (currentMidX - lastMid.x) / this.cameras.main.zoom;
                    const midDy = (currentMidY - lastMid.y) / this.cameras.main.zoom;
                    this.cameras.main.scrollX -= midDx;
                    this.cameras.main.scrollY -= midDy;

                    // 2. Pinch distance for Zoom
                    const distDiff = currentDist - lastPinchDist;
                    if (Math.abs(distDiff) > 1.0) {
                        const zoomDelta = distDiff * 0.003;
                        const newZoom = Phaser.Math.Clamp(this.cameras.main.zoom + zoomDelta, 0.3, 3);
                        this.cameras.main.setZoom(newZoom);
                    }

                    // 3. Twist Angle for 3D Isometric Camera Rotation
                    if (lastPinchAngle !== 0) {
                        let angleDelta = currentAngle - lastPinchAngle;
                        if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
                        if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

                        if (Math.abs(angleDelta) > 0.02) {
                            this.rotateCamera(angleDelta);
                        }
                    }
                }

                lastMid = { x: currentMidX, y: currentMidY };
                lastPinchDist = currentDist;
                lastPinchAngle = currentAngle;
                return;
            } else {
                lastMid = null;
                lastPinchDist = 0;
                lastPinchAngle = 0;
            }

            // Update Translucent Ghost Silhouette Preview during deployment
            if (this.deployingUnitId) {
                // pointer.worldX/y are screen coords relative to the canvas — use those directly
                // getWorldPoint() expects screen-space coords, so pass pointer.worldX/y (not worldX/Y)
                const screenX = pointer.worldX;
                const screenY = pointer.worldY;
                const worldPt = this.getWorldPoint(screenX, screenY);
                const el = this.getElevationInfo(worldPt.x, worldPt.y);
                // Ghost sits exactly at the pointer screen position
                const sx = screenX;
                const sy = screenY;

                if (!this.ghostContainer && this.add) {
                    this.ghostContainer = this.add.container(sx, sy);
                    this.ghostContainer.setDepth(995);

                    const circleG = this.add.graphics();
                    circleG.fillStyle(0x00f2fe, 0.35);
                    circleG.lineStyle(2, 0x00f2fe, 0.9);

                    const segments = 24;
                    const r = 1.0;
                    circleG.beginPath();
                    for (let i = 0; i <= segments; i++) {
                        const angle = (i / segments) * Math.PI * 2;
                        const px = Math.cos(angle) * r;
                        const py = Math.sin(angle) * r;
                        const rad = this.cameraYaw || 0;
                        const ix = px * Math.cos(rad) - py * Math.sin(rad);
                        const iy = (px * Math.sin(rad) + py * Math.cos(rad)) * 0.5;
                        if (i === 0) circleG.moveTo(ix, iy);
                        else circleG.lineTo(ix, iy);
                    }
                    circleG.closePath();
                    circleG.fill();
                    circleG.stroke();

                    const ghostText = this.add.text(0, -25, "DESPLEGAR", {
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontStyle: 'bold',
                        color: '#00f2fe',
                        backgroundColor: '#000000AA',
                        padding: { x: 4, y: 2 }
                    });
                    ghostText.setOrigin(0.5);

                    this.ghostContainer.add([circleG, ghostText]);
                } else if (this.ghostContainer) {
                    this.ghostContainer.setPosition(sx, sy);
                    this.ghostContainer.setVisible(true);
                }
            } else if (this.ghostContainer) {
                this.ghostContainer.setVisible(false);
            }

            const isMeasuringActive = !!(this.measureStartWorld || (this.isMeasuringMode && (pointer.isDown || pointer.wasTouch)));
            if (isMeasuringActive && this.measurementLine && this.measurementText) {
                const startWorld = this.measureStartWorld || { x: 30, y: 22 };
                const currentWorld = this.getWorldPoint(pointer.worldX, pointer.worldY);
                const dx = currentWorld.x - startWorld.x;
                const dy = currentWorld.y - startWorld.y;
                const distance = Math.hypot(dx, dy);
                
                this.measurementLine.clear();
                this.measurementLine.lineStyle(3, 0xfbbf24, 0.95);
                
                const startScreen = this.getIsoPoint(startWorld.x, startWorld.y);
                this.measurementLine.strokeLineShape(new Phaser.Geom.Line(
                    startScreen.x + this.cameras.main.width / 2, 
                    startScreen.y + 200, 
                    pointer.worldX, 
                    pointer.worldY
                ));

                this.measurementText.setText(`${distance.toFixed(1)}"`);
                this.measurementText.setPosition(pointer.worldX + 15, pointer.worldY - 15);
                this.measurementText.setVisible(true);
                return; // block panning while measuring
            }

            if (!pointer.isDown) return;

            // Rotate: Middle click OR Alt + Left click
            const isRotate = pointer.middleButtonDown() || (pointer.leftButtonDown() && pointer.event?.altKey);
            // Pan: Right click OR Left click on empty space OR 1-finger touch drag on empty space
            const isTouchPan = pointer.wasTouch && !this.draggingToken && !this.draggingTerrain;
            const isMousePan = pointer.rightButtonDown() || (pointer.leftButtonDown() && !this.draggingToken && !this.draggingTerrain && !isRotate && !pointer.event?.shiftKey && !pointer.event?.ctrlKey);
            const isPan = isTouchPan || isMousePan;

            if (this.marqueeStartWorld && pointer.isDown) {
                this.marqueeGraphics.clear();
                this.marqueeGraphics.lineStyle(2, 0x00ffff, 1);
                this.marqueeGraphics.fillStyle(0x00ffff, 0.2);
                const rect = new Phaser.Geom.Rectangle(
                    Math.min(this.marqueeStartWorld.x, pointer.worldX),
                    Math.min(this.marqueeStartWorld.y, pointer.worldY),
                    Math.abs(pointer.worldX - this.marqueeStartWorld.x),
                    Math.abs(pointer.worldY - this.marqueeStartWorld.y)
                );
                this.marqueeGraphics.fillRectShape(rect);
                this.marqueeGraphics.strokeRectShape(rect);
                return;
            }

            if (this.draggingTerrain) {
                const dx = pointer.worldX - this.draggingTerrain.startWorldX;
                const dy = pointer.worldY - this.draggingTerrain.startWorldY;
                this.draggingTerrain.frontG.x = dx;
                this.draggingTerrain.frontG.y = dy;
                this.draggingTerrain.backG.x = dx;
                this.draggingTerrain.backG.y = dy;
                return;
            }

            if (isPan) {
                const dx = (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
                const dy = (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
                this.cameras.main.scrollX -= dx;
                this.cameras.main.scrollY -= dy;
            } else if (isRotate) {
                const dx = pointer.x - pointer.prevPosition.x;
                this.rotateCamera(dx * 0.008);
            }
        });

        this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[], deltaX: number, deltaY: number) => {
            const newZoom = this.cameras.main.zoom - deltaY * 0.001;
            this.cameras.main.setZoom(Phaser.Math.Clamp(newZoom, 0.3, 3));
        });

        // External Camera Control Events from UI Buttons
        EventBus.on('camera-zoom-in', () => {
            this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom + 0.25, 0.3, 3));
        });
        EventBus.on('camera-zoom-out', () => {
            this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom - 0.25, 0.3, 3));
        });
        EventBus.on('camera-reset', () => {
            this.cameras.main.setZoom(1.0);
            this.cameras.main.scrollX = 0;
            this.cameras.main.scrollY = 0;
            this.cameras.main.setRotation(0);
            this.cameraYaw = 0;
            this.updateBoardRender();
        });
        EventBus.on('camera-rotate-left', () => {
            this.rotateCamera(-Math.PI / 8);
        });
        EventBus.on('camera-rotate-right', () => {
            this.rotateCamera(Math.PI / 8);
        });
        EventBus.on('animate-shoot', (data: { attackerId: string, targetId: string, color?: number }) => {
            this.playShootAnimation(data.attackerId, data.targetId, data.color);
        });
        EventBus.on('animate-damage', (data: { targetId: string, damage?: number }) => {
            this.playDamageAnimation(data.targetId, data.damage || 0);
        });
        EventBus.on('animate-teleport', (data: { x: number, y: number, color?: number }) => {
            this.playTeleportAnimation(data.x, data.y, data.color);
        });

        // Setup keyboard
        if (this.input.keyboard) {
            this.keyQ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
            this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
            this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        }

        EventBus.emit('scene-ready');
    }
    // Convert Grid (X,Y) to Isometric Screen (X,Y)
    getElevationInfo(x: number, y: number): { z: number, terrainId: string | null } {
        let maxZ = 0;
        let tId: string | null = null;
        this.terrain.forEach(t => {
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

    resolveWallCollisions(wx: number, wy: number, z: number, radius: number): { x: number, y: number } {
        let px = wx;
        let py = wy;

        this.terrain.forEach(ter => {
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

    getIsoPoint(tx: number, ty: number) {
        const cx = this.gridWidth / 2;
        const cy = this.gridHeight / 2;
        
        // Translate to origin
        const dx = tx - cx;
        const dy = ty - cy;
        
        const rad = this.cameraYaw;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        // Rotate around grid center
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        
        // Translate back
        const ftx = rx + cx;
        const fty = ry + cy;

        const sx = (ftx - fty) * this.tileWidth;
        const sy = (ftx + fty) * this.tileHeight;
        
        return { x: sx, y: sy };
    }

    // Convert Isometric Screen (X,Y) to Grid (X,Y)
    getWorldPoint(sx: number, sy: number) {
        // Adjust for grid offset
        sx -= this.cameras.main.width / 2;
        sy -= 200;
        
        // Inverse isometric projection
        const ftx = (sx / this.tileWidth + sy / this.tileHeight) / 2;
        const fty = (sy / this.tileHeight - sx / this.tileWidth) / 2;
        
        const cx = this.gridWidth / 2;
        const cy = this.gridHeight / 2;
        
        // Translate to origin
        const rx = ftx - cx;
        const ry = fty - cy;
        
        // Inverse yaw rotation
        const rad = -this.cameraYaw;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        const dx = rx * cos - ry * sin;
        const dy = rx * sin + ry * cos;
        
        // Translate back
        const tx = dx + cx;
        const ty = dy + cy;
        
        return { x: tx, y: ty };
    }

    createTransparentTexture(sourceKey: string, newKey: string) {
        const srcTexture = this.textures.get(sourceKey);
        if (!srcTexture || srcTexture.key === '__MISSING') return;
        
        const src = srcTexture.getSourceImage();
        if (!src) return;

        const canvas = document.createElement('canvas');
        canvas.width = src.width as number;
        canvas.height = src.height as number;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(src as CanvasImageSource, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        
        // Remove white/grey/green backgrounds while preserving colored miniature pixels
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Remove bright green chroma key
            if (g > 80 && g > r * 1.3 && g > b * 1.3) {
                data[i + 3] = 0;
                continue;
            }
            
            // Check how "grey/white" the pixel is: measure the max spread between channels
            // Pure grey/white pixels have very similar R,G,B values (low variance)
            const maxChannel = Math.max(r, g, b);
            const minChannel = Math.min(r, g, b);
            const saturation = maxChannel - minChannel; // 0 = grey, high = colorful
            const brightness = (r + g + b) / 3;
            
            // Fully transparent: bright AND low saturation (definitely background)
            if (brightness > 200 && saturation < 30) {
                data[i + 3] = 0;
            }
            // Partial fade: medium brightness with low saturation (anti-alias edge)
            else if (brightness > 160 && saturation < 20) {
                const alpha = Math.round(((saturation / 20) * 0.7) * 255);
                data[i + 3] = Math.min(data[i + 3], alpha);
            }
        }
        
        ctx.putImageData(imgData, 0, 0);
        if (this.textures.exists(newKey)) {
            this.textures.remove(newKey);
        }
        this.textures.addCanvas(newKey, canvas);
    }

    generateNoiseTexture() {
        if (!this.textures.exists('simple_battlemat')) {
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                // Base color: very dark slate gray
                ctx.fillStyle = '#16181a';
                ctx.fillRect(0, 0, size, size);
                
                const imgData = ctx.getImageData(0, 0, size, size);
                const data = imgData.data;
                
                // Add subtle monochromatic noise
                for (let i = 0; i < data.length; i += 4) {
                    const noise = (Math.random() - 0.5) * 14; 
                    data[i] = Math.min(255, Math.max(0, 22 + noise));     // R
                    data[i+1] = Math.min(255, Math.max(0, 24 + noise));   // G
                    data[i+2] = Math.min(255, Math.max(0, 26 + noise));   // B
                    data[i+3] = 255;                                      // A
                }
                ctx.putImageData(imgData, 0, 0);
            }
            this.textures.addCanvas('simple_battlemat', canvas);
        }
    }

    drawGrid() {
        if (!this.add) return;
        if (!this.gridGraphics) {
            this.gridGraphics = this.add.graphics();
        }
        this.gridGraphics.clear();
        this.gridGraphics.lineStyle(1, 0x00f2fe, 0.15); // Neon cyan for sci-fi look

        for (let x = 0; x <= this.gridWidth; x++) {
            const p1 = this.getIsoPoint(x, 0);
            const p2 = this.getIsoPoint(x, this.gridHeight);
            this.gridGraphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
        }

        for (let y = 0; y <= this.gridHeight; y++) {
            const p1 = this.getIsoPoint(0, y);
            const p2 = this.getIsoPoint(this.gridWidth, y);
            this.gridGraphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
        }
        
        // Offset so grid is centered
        this.gridGraphics.setPosition(this.cameras.main.width / 2, 200);
    }

    redrawTokens() {
        const tokenSprites = this.tokenSprites;
        if (!tokenSprites || !(tokenSprites as any).children) return;
        
        const currentIds = this.tokens.map(t => t.id);
        
        // Remove sprites that no longer exist with a sleek Death Animation
        const sprites = tokenSprites.getChildren() as Phaser.GameObjects.Sprite[];
        sprites.forEach(sprite => {
            const tokenId = sprite.getData('tokenId');
            if (!currentIds.includes(tokenId) && !sprite.getData('dying')) {
                sprite.setData('dying', true);
                
                // Remove from tokenSprites group immediately so targeting/physics ignores it
                tokenSprites.remove(sprite);

                // Create a red shockwave/explosion ring effect
                const deathEffect = this.add.graphics();
                deathEffect.setDepth(sprite.depth + 10);
                
                let radius = 5;
                const fxTimer = this.time.addEvent({
                    delay: 20,
                    repeat: 25,
                    callback: () => {
                        deathEffect.clear();
                        radius += 1.5;
                        deathEffect.lineStyle(3, 0xff0000, Math.max(0, 1 - radius / 40));
                        deathEffect.strokeCircle(sprite.x, sprite.y - 15, radius);
                        deathEffect.fillStyle(0xff2222, Math.max(0, 0.4 - radius / 80));
                        deathEffect.fillCircle(sprite.x, sprite.y - 15, radius * 0.8);
                    }
                });

                // Tint sprite red, tilt it over (collapse), shrink and fade out
                sprite.setTint(0xff3333);
                this.tweens.add({
                    targets: sprite,
                    angle: 90,             // Tilt over on its side
                    alpha: 0,              // Fade out
                    scaleX: sprite.scaleX * 0.4,
                    scaleY: sprite.scaleY * 0.4,
                    y: sprite.y + 12,      // Fall to ground
                    duration: 600,
                    ease: 'Power2',
                    onComplete: () => {
                        deathEffect.destroy();
                        sprite.destroy();
                    }
                });
            }
        });
        
        // Add or update sprites
        this.tokens.forEach(tok => {
            let sprite = (tokenSprites.getChildren() as Phaser.GameObjects.Sprite[])
                .find(s => s.getData('tokenId') === tok.id);
                
            if (!sprite) {
                // Derive texture key directly from the token's image path
                const dsId = DATASHEETS.find(ds => ds.image && ds.image === tok.image)?.id;
                const miniKey = dsId ? `mini_${dsId}` : null;
                const fallbackKey = tok.faction === 'imperium' ? 'token_imperium' : 'token_chaos';
                const imgKey = (miniKey && this.textures.exists(miniKey)) ? miniKey : fallbackKey;
                sprite = this.add.sprite(0, 0, imgKey);
                
                // Calculate scale dynamically based on real 40k rules
                // 1 inch = 25.4 mm. 1 grid square = 1 inch.
                // In our isometric projection, 1 grid square has a screen-space width of 64 pixels (2 * tileWidth).
                const targetWidth = (tok.baseMm / 25.4) * 64;
                const scale = targetWidth / sprite.width;
                sprite.setScale(scale);
                sprite.setData('baseScale', scale); // Save for physics lifting
                
                sprite.setOrigin(0.5, 0.85);
                
                sprite.setInteractive({ cursor: 'pointer' });
                this.input.setDraggable(sprite);
                
                sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                    if (pointer.event?.shiftKey || this.isMultiSelectMode) {
                        EventBus.emit('ui-toggle-select', tok.id);
                    } else {
                        EventBus.emit('ui-select', [tok.id]);
                    }
                });
                
                tokenSprites.add(sprite);
            }
            
            // Store token data on sprite
            sprite.setData('tokenId', tok.id);
            sprite.setData('worldX', tok.x);
            sprite.setData('worldY', tok.y);
            
            const el = this.getElevationInfo(tok.x, tok.y);
            sprite.setData('z', tok.z ?? el.z);
            sprite.setData('terrainId', el.terrainId);
        });
        
        // Render positions for all non-dragged tokens
        this.updateBoardRender();

        // Handle Drag Events globally
        this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
            this.draggingToken = gameObject;
            this.dragStartWorld = { x: gameObject.getData('worldX'), y: gameObject.getData('worldY') };
            this.dragStartElevation = gameObject.getData('z') || 0;
            // Store the initial offset between pointer and sprite so we can drag it from where we clicked
            gameObject.setData('dragOffsetX', gameObject.x - pointer.worldX);
            gameObject.setData('dragOffsetY', gameObject.y - pointer.worldY);
            gameObject.setData('targetX', gameObject.x);
            gameObject.setData('targetY', gameObject.y);
            
            this.dragGroup = null;
            const draggedId = gameObject.getData('tokenId');
            const selectedIds = this.selectedIds;
            if (selectedIds.includes(draggedId) && selectedIds.length > 1) {
                this.dragGroup = [];
                const sprites = this.tokenSprites.getChildren() as Phaser.GameObjects.Sprite[];
                for (const sprite of sprites) {
                    const id = sprite.getData('tokenId');
                    if (selectedIds.includes(id) && id !== draggedId) {
                        this.dragGroup.push({
                            sprite,
                            startWorldX: sprite.getData('worldX'),
                            startWorldY: sprite.getData('worldY'),
                            startZ: sprite.getData('z') || 0
                        });
                    }
                }
            }
        });

        this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
            const phase = this.gameState?.phase;
            const isCombatPhase = phase === 'shooting' || phase === 'fight';

            if (isCombatPhase) {
                this.measurementLine.clear();
                
                const attackerTok = this.tokens.find(t => t.id === gameObject.getData('tokenId'));
                let maxRange = 999;
                if (attackerTok && phase === 'shooting') {
                    const ranged = attackerTok.weapons.filter(w => w.type === 'ranged');
                    maxRange = ranged.length > 0 ? Math.max(...ranged.map(w => w.range)) : 0;
                } else if (attackerTok && phase === 'fight') {
                    maxRange = 1;
                }

                const targetX = pointer.worldX;
                const targetY = pointer.worldY;
                
                const currentWorld = this.getWorldPoint(targetX, targetY);
                const attackerWorld = { x: attackerTok?.x || 0, y: attackerTok?.y || 0 };
                const distInches = Math.hypot(currentWorld.x - attackerWorld.x, currentWorld.y - attackerWorld.y);
                const outOfRange = distInches > maxRange;
                
                const lineColor = outOfRange ? 0x888888 : 0xff0000;
                
                this.measurementLine.lineStyle(3, lineColor, 0.9);
                this.measurementLine.strokeLineShape(new Phaser.Geom.Line(
                    gameObject.x, 
                    gameObject.y, 
                    targetX, 
                    targetY
                ));
                
                // Outer circle
                this.measurementLine.lineStyle(2, lineColor, 1.0);
                this.measurementLine.strokeCircle(targetX, targetY, 16);
                
                // Center dot
                this.measurementLine.fillStyle(lineColor, 1.0);
                this.measurementLine.fillCircle(targetX, targetY, 4);
                return;
            }

            // IGNORE Phaser's dragX/dragY because they break if we don't instantly update gameObject.x/y
            let targetX = pointer.worldX + gameObject.getData('dragOffsetX');
            let targetY = pointer.worldY + gameObject.getData('dragOffsetY');

            let currentWorld = this.getWorldPoint(targetX, targetY + this.dragStartElevation);
            
            // Enforce maximum movement distance from token stats
            const tokenId = gameObject.getData('tokenId');
            const tok = this.tokens.find(t => t.id === tokenId);

            const unit = tok ? this.units.find(u => u.id === tok.unitId) : null;
            const hasAlreadyMoved = !!tok?.moved;

            if (this.dragStartWorld && tok && phase !== 'deployment') {
                const baseMove = tok.stats.move || 6;
                const advanceBonus = unit?.advanced ? (unit.advanceRoll || 0) : 0;
                const isMovementPhase = phase === 'movement';
                const maxMove = (hasAlreadyMoved || !isMovementPhase) ? 0 : (baseMove + advanceBonus);

                const dx = currentWorld.x - this.dragStartWorld.x;
                const dy = currentWorld.y - this.dragStartWorld.y;
                const dist = Math.hypot(dx, dy);

                if (dist > maxMove) {
                    if (maxMove === 0) {
                        currentWorld.x = this.dragStartWorld.x;
                        currentWorld.y = this.dragStartWorld.y;
                    } else if (dist > 0) {
                        currentWorld.x = this.dragStartWorld.x + (dx / dist) * maxMove;
                        currentWorld.y = this.dragStartWorld.y + (dy / dist) * maxMove;
                    }
                }
            }

            const baseMm = tok ? tok.baseMm : 32;
            const radius = (baseMm / 25.4) / 2; // radius in inches
            
            let el = this.getElevationInfo(currentWorld.x, currentWorld.y);
            currentWorld = this.resolveWallCollisions(currentWorld.x, currentWorld.y, el.z, radius);
            
            // Re-evaluate elevation in case collision pushed us onto/off a platform
            el = this.getElevationInfo(currentWorld.x, currentWorld.y);
            
            // Convert resolved world coords back to physical screen target coordinates
            const iso = this.getIsoPoint(currentWorld.x, currentWorld.y);
            targetX = iso.x + this.cameras.main.width / 2;
            targetY = iso.y + 200 - el.z;
            
            gameObject.setData('z', el.z);
            gameObject.setData('terrainId', el.terrainId);
            
            // Set targets for the physics update loop
            gameObject.setData('targetX', targetX);
            gameObject.setData('targetY', targetY);
            
            // Update multi-selection drag group
            if (this.dragGroup && this.dragStartWorld) {
                const deltaWorldX = currentWorld.x - this.dragStartWorld.x;
                const deltaWorldY = currentWorld.y - this.dragStartWorld.y;
                for (const member of this.dragGroup) {
                    let mx = member.startWorldX + deltaWorldX;
                    let my = member.startWorldY + deltaWorldY;
                    
                    const mTokenId = member.sprite.getData('tokenId');
                    const mTok = this.tokens.find(t => t.id === mTokenId);
                    const mbaseMm = mTok ? mTok.baseMm : 32;
                    const mRadius = (mbaseMm / 25.4) / 2;
                    
                    let mel = this.getElevationInfo(mx, my);
                    let mResolved = this.resolveWallCollisions(mx, my, mel.z, mRadius);
                    mel = this.getElevationInfo(mResolved.x, mResolved.y);
                    
                    const miso = this.getIsoPoint(mResolved.x, mResolved.y);
                    const mTargetX = miso.x + this.cameras.main.width / 2;
                    const mTargetY = miso.y + 200 - mel.z;
                    
                    member.sprite.setData('targetX', mTargetX);
                    member.sprite.setData('targetY', mTargetY);
                    member.sprite.setData('z', mel.z);
                    member.sprite.setData('terrainId', mel.terrainId);
                }
            }
            
            // Draw Virtual Ruler
            if (this.dragStartWorld && this.measurementLine && this.measurementText) {
                const currentWorld = this.getWorldPoint(targetX, targetY);
                const dx = currentWorld.x - this.dragStartWorld.x;
                const dy = currentWorld.y - this.dragStartWorld.y;
                const distance = Math.hypot(dx, dy); // True distance in inches
                
                this.measurementLine.clear();
                this.measurementLine.lineStyle(2, hasAlreadyMoved ? 0xff0000 : 0x00ff00, 1);
                
                const startScreen = this.getIsoPoint(this.dragStartWorld.x, this.dragStartWorld.y);
                this.measurementLine.strokeLineShape(new Phaser.Geom.Line(
                    startScreen.x + this.cameras.main.width / 2, 
                    startScreen.y + 200, 
                    targetX, 
                    targetY
                ));
                
                if (hasAlreadyMoved) {
                    this.measurementText.setText(`¡Ya movió!`);
                } else {
                    this.measurementText.setText(`${distance.toFixed(1)}"`);
                }
                this.measurementText.setPosition(targetX + 15, targetY - 15);
                this.measurementText.setVisible(true);
            }
        });

        this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
            const phase = this.gameState?.phase;
            const isCombatPhase = phase === 'shooting' || phase === 'fight';

            if (isCombatPhase) {
                const pointerPoint = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
                let hitEnemyId = null;
                const attackerTok = this.tokens.find(t => t.id === gameObject.getData('tokenId'));
                
                const sprites = this.tokenSprites.getChildren() as Phaser.GameObjects.Sprite[];
                for (const sprite of sprites) {
                    if (sprite === gameObject) continue;
                    
                    const targetTok = this.tokens.find(t => t.id === sprite.getData('tokenId'));
                    if (!targetTok || !attackerTok || targetTok.faction === attackerTok.faction) continue;
                    
                    const dist = Phaser.Math.Distance.Between(pointerPoint.x, pointerPoint.y, sprite.x, sprite.y);
                    if (dist < 40) { 
                        hitEnemyId = targetTok.id;
                        break;
                    }
                }
                
                if (hitEnemyId) {
                    const targetTok = this.tokens.find(t => t.id === hitEnemyId);
                    if (attackerTok && targetTok) {
                        let maxRange = 999;
                        if (phase === 'shooting') {
                            const ranged = attackerTok.weapons.filter(w => w.type === 'ranged');
                            maxRange = ranged.length > 0 ? Math.max(...ranged.map(w => w.range)) : 0;
                        } else if (phase === 'fight') {
                            maxRange = 1;
                        }
                        
                        const distInches = Math.hypot(attackerTok.x - targetTok.x, attackerTok.y - targetTok.y);
                        
                        if (distInches <= maxRange) {
                            const attackerId = gameObject.getData('tokenId');
                            EventBus.emit('ui-queue-attack', { attackerId, targetId: hitEnemyId });
                        } else {
                            this.showFloatingText(pointerPoint.x, pointerPoint.y, "¡Fuera de Rango!", 0xff0000);
                        }
                    }
                }
                
                this.measurementLine.clear();
                this.draggingToken = null;
                this.dragStartWorld = null;
                this.dragStartElevation = 0;
                return;
            }

            if (this.dragStartWorld) {
                // Calculate final world position from the target/snapped coordinate, not the lagging physics sprite
                const moves = [];
                
                const targetX = gameObject.getData('targetX');
                const targetY = gameObject.getData('targetY');
                const endWorld = this.getWorldPoint(targetX, targetY + (gameObject.getData('z') || 0));
                const el = this.getElevationInfo(endWorld.x, endWorld.y);
                moves.push({ id: gameObject.getData('tokenId'), x: endWorld.x, y: endWorld.y, z: el.z });
                
                if (this.dragGroup) {
                    for (const member of this.dragGroup) {
                        const mTargetX = member.sprite.getData('targetX');
                        const mTargetY = member.sprite.getData('targetY');
                        const mEndWorld = this.getWorldPoint(mTargetX, mTargetY + (member.sprite.getData('z') || 0));
                        const mel = this.getElevationInfo(mEndWorld.x, mEndWorld.y);
                        moves.push({ id: member.sprite.getData('tokenId'), x: mEndWorld.x, y: mEndWorld.y, z: mel.z });
                    }
                }
                
                // Emit move event back to React with updated Z
                EventBus.emit('ui-move', moves);
            }
            this.draggingToken = null;
            this.dragGroup = null;
            this.dragStartWorld = null;
            this.dragStartElevation = 0;
            if (this.measurementLine) this.measurementLine.clear();
            if (this.measurementText) this.measurementText.setVisible(false);
        });
    }

    redrawTerrain() {
        if (!this.add || !this.cameras || !this.cameras.main || this.cameras.main.width <= 0 || this.cameras.main.height <= 0) return;

        // Clear all existing graphics
        this.terrainGraphicsMap.forEach(g => {
            if (g.back && g.back.scene) g.back.destroy();
            if (g.front && g.front.scene) g.front.destroy();
        });
        this.terrainGraphicsMap.clear();
        
        if (this.shadowGraphics) {
            this.shadowGraphics.clear();
        }

        this.terrain.forEach(ter => {
            const backG = this.add.graphics();
            const frontG = this.add.graphics();

            const pts = ter.points.map((p: { x: number, y: number }) => {
                const iso = this.getIsoPoint(p.x, p.y);
                return { 
                    worldX: p.x, 
                    worldY: p.y, 
                    x: iso.x + this.cameras.main.width / 2, 
                    y: iso.y + 200 
                };
            });
            
            // ----- FLAT FLOOR SHADOW (cartoon / illustration style) -----
            // Offset footprint polygon to simulate a directional blob shadow cast on the ground
            if (this.shadowGraphics) {
                const shadowOffsetX = 20;
                const shadowOffsetY = 10;
                this.shadowGraphics.fillStyle(0x000000, 0.35);
                this.shadowGraphics.beginPath();
                this.shadowGraphics.moveTo(pts[0].x + shadowOffsetX, pts[0].y + shadowOffsetY);
                for (let i = 1; i < pts.length; i++) {
                    this.shadowGraphics.lineTo(pts[i].x + shadowOffsetX, pts[i].y + shadowOffsetY);
                }
                this.shadowGraphics.closePath();
                this.shadowGraphics.fill();
            }
            
            // Adjust to grid center and calculate min/max Y for depth sorting
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
            
            // (Shadow was drawn above the forEach loop as a flat polygon)

            // Height simulation
            const height = ter.height !== undefined ? ter.height : (ter.type === "obscuring" ? 80 : (ter.label === "Bosque" ? 40 : 10));

            this.terrainGraphicsMap.set(ter.id, { back: backG, front: frontG, max_sy, height });
            backG.setDepth(min_sy - 1);
            frontG.setDepth(max_sy + 1);
            
            // Draw floor footprint (Back Layer) - dark base to show the ground below the structure
            backG.fillStyle(0x0a0815, 1.0); // Very dark floor
            backG.lineStyle(1, 0x00000, 0.8);
            backG.beginPath();
            backG.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) backG.lineTo(pts[i].x, pts[i].y);
            backG.closePath();
            backG.fill();

            // Collect walls and sort by depth (isometric Z-sorting)
            interface Wall { p1: any, p2: any, midY: number, isInner: boolean, z1: number, z2: number }
            const walls: Wall[] = [];
            for (let i = 0; i < pts.length; i++) {
                const prevI = (i - 1 + pts.length) % pts.length;
                const nextI = (i + 1) % pts.length;
                const nextNextI = (i + 2) % pts.length;
                
                // Cross product to find concave vertices in the clockwise world footprint
                const cp_i = (pts[i].worldX - pts[prevI].worldX) * (pts[nextI].worldY - pts[i].worldY) - (pts[i].worldY - pts[prevI].worldY) * (pts[nextI].worldX - pts[i].worldX);
                const cp_next = (pts[nextI].worldX - pts[i].worldX) * (pts[nextNextI].worldY - pts[nextI].worldY) - (pts[nextI].worldY - pts[i].worldY) * (pts[nextNextI].worldX - pts[nextI].worldX);
                
                // If either vertex of the wall is concave (cp < 0), this is an inner wall of a concave shape
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
            
            // Draw furthest walls first (lowest Y) so closer walls overlap them correctly
            walls.sort((a, b) => a.midY - b.midY);

            for (const w of walls) {
                const { p1, p2, z1, z2 } = w;
                
                // Skip drawing walls that have 0 height (flat on ground)
                if (z1 === 0 && z2 === 0) continue;
                
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx*dx + dy*dy) || 1;
                // Outward normal for a clockwise polygon in screen space
                const ny = -dx / len;
                let isFront = (ny > -0.01); 
                
                // Inner walls of concave shapes (like the inside of an L) never form the front occluding hull
                if (w.isInner) {
                    isFront = false;
                }
                
                const g = isFront ? frontG : backG;
                
                const nx = dy / len; // Screen-space normal X (used for isFront detection only)
                
                // --- CARTOON LIGHTING using WORLD-SPACE normal (rotation-independent) ---
                // Light source fixed at world direction (-1, -1) = comes from top-left of the board
                const wdx = p2.worldX - p1.worldX;
                const wdy = p2.worldY - p1.worldY;
                const wlen = Math.sqrt(wdx * wdx + wdy * wdy) || 1;
                // Outward world-space normal (perpendicular to wall edge)
                const wnx = wdy / wlen;
                const wny = -wdx / wlen;
                // Dot product with fixed light direction (-1, -1) normalized = (-0.707, -0.707)
                const lightDot = (wnx * -0.707 + wny * -0.707 + 1) / 2; // 0..1
                const light = Math.max(0, Math.min(1, lightDot));
                
                // Alien Sci-Fi base colors
                let baseHex = 0x211b3d; // lit face: purple/metal
                let shadowHex = 0x0a0614; // shadow face: near-black
                if (ter.type === "obscuring") { baseHex = 0x1e1a35; shadowHex = 0x080510; }
                else if (ter.label === "Bosque") { baseHex = 0x1a0b17; shadowHex = 0x0a0810; }
                
                // Hard two-tone cartoon shading: lit side bright, shadow side very dark
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
                // Shadow-side walls get a thicker dark outline for cartoon cel-shading look
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
                
                // Procedural Textures - Alien Sci-Fi
                // Only draw standard textures on flat rectangular walls
                if (ter.type === "obscuring" && z1 === z2 && z1 >= 40) {
                    // Use WORLD length (wlen) for texturing so it doesn't slide when camera rotates!
                    const windowWidth = 20; // scaled up slightly for world space
                    const pillarWidth = 10;
                    const unit = windowWidth + pillarWidth;
                    const count = Math.floor(wlen / unit);
                    
                    const floorHeight = 40; 
                    const floors = Math.floor(height / floorHeight);
                    
                    // Neon highlights
                    const highlightColor = 0x00f2fe; // Cyan glow
                    const shadowColor = 0x050114;
                    
                    for (let f = 0; f < floors; f++) {
                        const zBase = f * floorHeight + 5;
                        const zTop = zBase + 20;
                        const zPeak = zTop + 10;
                        
                        // Draw alien angular windows/vents
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
                            g.lineTo(wmidX, wmidY - zTop); // Hexagonal alien vent shape
                            g.lineTo(wx1, wy1 - zTop);
                            g.closePath();
                            g.fill();
                            
                            // Glowing vent edge
                            g.lineStyle(1, highlightColor, 0.8);
                            g.strokePath();
                            
                            // Add a glowing core line inside the vent
                            g.lineStyle(2, 0xff00ff, 0.6); // Magenta core
                            g.beginPath();
                            g.moveTo(wmidX, wmidY - zBase - 2);
                            g.lineTo(wmidX, wmidY - zTop + 2);
                            g.strokePath();
                            // Decorative glowing data banks (rectangles) below the vent
                            const tW = 5 / wlen; // 5 units wide in world space
                            const px1 = p1.x + dx * (tMid - tW);
                            const py1 = p1.y + dy * (tMid - tW);
                            const px2 = p1.x + dx * (tMid + tW);
                            const py2 = p1.y + dy * (tMid + tW);
                            
                            g.fillStyle(0x00f2fe, 0.7); // Bright cyan glowing data bank
                            g.beginPath();
                            g.moveTo(px1, py1 - zBase + 2);
                            g.lineTo(px2, py2 - zBase + 2);
                            g.lineTo(px2, py2 - zBase + 4);
                            g.lineTo(px1, py1 - zBase + 4);
                            g.closePath();
                            g.fill();
                            
                            // Horizontal vent slits (tiny rectangles) above the glowing core
                            g.lineStyle(1, shadowColor, 0.9);
                            for (let slit = 0; slit < 3; slit++) {
                                const zs = zTop - 2 - slit * 2;
                                g.beginPath();
                                g.moveTo(px1, py1 - zs);
                                g.lineTo(px2, py2 - zs);
                                g.strokePath();
                            }
                        }
                        
                        // Glowing floor ledges
                        if (f > 0) {
                            const zLedge = f * floorHeight;
                            g.lineStyle(2, 0xff00ff, 0.7); // Magenta glowing floor strip
                            g.beginPath();
                            g.moveTo(p1.x, p1.y - zLedge);
                            g.lineTo(p2.x, p2.y - zLedge);
                            g.strokePath();
                        }
                    }
                    
                    // Vertical alien tech pillars
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
                    // Toxic/plasma barrel (small rectangle with horizontal bands)
                    const barrelHighlight = 0x00ff00; // Neon green plasma
                    const barrelDark = 0x113311;
                    
                    g.lineStyle(2, barrelHighlight, 0.8);
                    
                    // Draw horizontal bands
                    for (let z = 3; z <= height - 3; z += 5) {
                        g.beginPath();
                        g.moveTo(p1.x, p1.y - z);
                        g.lineTo(p2.x, p2.y - z);
                        g.strokePath();
                    }
                    
                    // Vertical seams
                    g.lineStyle(1, barrelDark, 0.6);
                    g.beginPath();
                    g.moveTo(p1.x + dx*0.3, p1.y + dy*0.3);
                    g.lineTo(p1.x + dx*0.3, p1.y + dy*0.3 - height);
                    g.strokePath();
                } else if (ter.type === "cover") {
                    const highlightColor = 0xff00ff; // Magenta crates
                    
                    // Glowing X Braces for sci-fi cover
                    g.lineStyle(2, highlightColor, 0.8);
                    g.beginPath();
                    g.moveTo(p1.x, p1.y);
                    g.lineTo(p2.x, p2.y - height);
                    g.moveTo(p1.x, p1.y - height);
                    g.lineTo(p2.x, p2.y);
                    g.strokePath();
                    
                    // Decorative tech panel in the center of the crate
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
                    

                    // Borders
                    g.lineStyle(2, highlightColor, 0.8);
                    g.beginPath();
                    g.moveTo(p1.x, p1.y - 2);
                    g.lineTo(p2.x, p2.y - 2);
                    g.moveTo(p1.x, p1.y - height + 2);
                    g.lineTo(p2.x, p2.y - height + 2);
                    g.strokePath();
                } else if (ter.label === "Bosque") {
                    // Alien crystal growth pattern
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
                    // Fallback ledges for unknown terrain types with platforms
                    ter.platforms.forEach(plat => {
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

            // Draw platforms (Internal floors) - Back Layer so tokens can stand on them
            // and front walls occlude them
            if (ter.platforms) {
                const floors = [...ter.platforms];
                floors.sort((a, b) => a.height - b.height);
                
                floors.forEach(plat => {
                    const platHeight = plat.height;
                    if (plat.points) { // Only draw if it has custom wide floor points
                        const floorPts = plat.points.map(p => {
                            const iso = this.getIsoPoint(p.x, p.y);
                            return { x: iso.x + this.cameras.main.width / 2, y: iso.y + 200 };
                        });
                        
                        const floorColor = ter.type === "obscuring" ? 0x161329 : (ter.label === "Bosque" ? 0x1a0b17 : 0x211b3d);
                        backG.fillStyle(floorColor, 1.0); // Draw into backG!
                        backG.lineStyle(2, 0x00f2fe, 0.8); // Glowing cyan edges for floors
                        
                        backG.beginPath();
                        backG.moveTo(floorPts[0].x, floorPts[0].y - platHeight);
                        for (let i = 1; i < floorPts.length; i++) backG.lineTo(floorPts[i].x, floorPts[i].y - platHeight);
                        backG.closePath();
                        backG.fill();
                        backG.strokePath();
                        
                        // Add an alien hexagonal pattern on the floor
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

            // Draw Wall Tops (Front Layer) - Cartoon-shaded roof cap
            // The top face is always the most lit face (faces the sky/light source)
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
            
            // Cartoon top highlight: draw a subtle bright inner stroke near the top-left corner
            frontG.lineStyle(2, 0x6080b0, 0.5);
            frontG.beginPath();
            frontG.moveTo(pts[0].x, pts[0].y - z0);
            frontG.lineTo(pts[1 % pts.length].x, pts[1 % pts.length].y - (ter.zHeights ? ter.zHeights[1 % pts.length] : height));
            frontG.strokePath();

            // Make interactive for terrain phase
            const hitPoly = pts.map(p => ({ x: p.x, y: p.y - (ter.zHeights ? ter.zHeights[0] : height) }));
            frontG.setInteractive(new Phaser.Geom.Polygon(hitPoly), Phaser.Geom.Polygon.Contains);
            frontG.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                if (this.gameState?.phase === 'roster') {
                    this.draggingTerrain = {
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

    showFloatingText(x: number, y: number, msg: string, color: number) {
        if (!this.add) return;
        const text = this.add.text(x, y, msg, {
            fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#ffffff', backgroundColor: '#' + color.toString(16).padStart(6, '0'), padding: { x: 6, y: 4 }
        });
        text.setOrigin(0.5, 1);
        text.setDepth(10000);
        this.tweens.add({
            targets: text, y: y - 40, alpha: 0, duration: 1500, ease: 'Power2', onComplete: () => text.destroy()
        });
    }

    update(time: number, delta: number) {
        if (this.keyQ?.isDown) this.rotateCamera(-0.002 * delta);
        if (this.keyE?.isDown) this.rotateCamera(0.002 * delta);
        
        const panSpeed = 0.5 * delta / this.cameras.main.zoom;
        if (this.keyW?.isDown) this.cameras.main.scrollY -= panSpeed;
        if (this.keyS?.isDown) this.cameras.main.scrollY += panSpeed;
        if (this.keyA?.isDown) this.cameras.main.scrollX -= panSpeed;
        if (this.keyD?.isDown) this.cameras.main.scrollX += panSpeed;
        
        // --- PHYSICS AND DRAG UPDATE LOOP ---
        if (this.tokenSprites) {
            const sprites = this.tokenSprites.getChildren() as Phaser.GameObjects.Sprite[];
            sprites.forEach(sprite => {
                const baseScale = sprite.getData('baseScale') || 1.0;
                
                const isCombatPhase = this.gameState?.phase === 'shooting' || this.gameState?.phase === 'fight';

                if (this.draggingToken === sprite && !isCombatPhase) {
                    // Physics drag: lerp towards target
                    const targetX = sprite.getData('targetX');
                    // Add a vertical lift offset (-30px) so the piece physically rises above the board
                    const targetY = sprite.getData('targetY') - 30; 
                    
                    const vx = targetX - sprite.x;
                    const vy = targetY - sprite.y;
                    
                    sprite.x += vx * 0.3;
                    sprite.y += vy * 0.3;
                    
                    // Wobble effect based on velocity (tilting left/right as it moves)
                    // The faster it moves horizontally, the more it leans
                    const targetRotation = vx * 0.004; 
                    sprite.rotation = Phaser.Math.Linear(sprite.rotation, targetRotation, 0.2);
                    
                    // Keep scale normal, no size increase
                    sprite.setScale(Phaser.Math.Linear(sprite.scale, baseScale, 0.2));
                    sprite.setDepth(targetY + 500); // Always float on top of everything
                    return; 
                }
                
                // Settle scale and rotation back to normal when not dragging
                if (sprite.scale !== baseScale) {
                    sprite.setScale(Phaser.Math.Linear(sprite.scale, baseScale, 0.2));
                }
                if (Math.abs(sprite.rotation) > 0.01) {
                    sprite.rotation = Phaser.Math.Linear(sprite.rotation, 0, 0.2);
                } else {
                    sprite.rotation = 0;
                }
                
                const tx = sprite.getData('worldX');
                const ty = sprite.getData('worldY');
                if (tx !== undefined && ty !== undefined) {
                    const tz = sprite.getData('z') || 0;
                    const tId = sprite.getData('terrainId');
                    const pt = this.getIsoPoint(tx, ty);
                    const sx = pt.x + this.cameras.main.width / 2;
                    const sy = pt.y + 200;
                    
                    let depth = sy; 
                    
                    if (tz > 0 && tId) {
                        const tG = this.terrainGraphicsMap.get(tId);
                        if (tG && tz >= tG.height) {
                            depth = Math.max(depth, tG.max_sy + 2);
                        }
                    }
                    
                    // SNAP instantly to place 
                    sprite.x = sx;
                    sprite.y = sy - tz;
                    sprite.setDepth(depth); 
                }
            });
        }
        
        // Also update the measurement line if it's currently dragging (Movement phase only)
        const isCombatPhase = this.gameState?.phase === 'shooting' || this.gameState?.phase === 'fight';
        if (this.draggingToken && this.dragStartWorld && this.measurementLine && !isCombatPhase) {
            const startScreen = this.getIsoPoint(this.dragStartWorld.x, this.dragStartWorld.y);
            const dragZShift = (this.draggingToken.getData('z') || 0) - this.dragStartElevation;
            
            const targetX = this.draggingToken.getData('targetX');
            const targetY = this.draggingToken.getData('targetY');
            
            this.measurementLine.clear();
            
            // 1. Draw Virtual Ruler line
            this.measurementLine.lineStyle(2, 0x00ff00, 1);
            this.measurementLine.strokeLineShape(new Phaser.Geom.Line(
                startScreen.x + this.cameras.main.width / 2, 
                startScreen.y + 200 - this.dragStartElevation, 
                this.draggingToken.x, 
                this.draggingToken.y + dragZShift
            ));
            
            // 2. Draw Drop Marker (where the miniature will land)
            const tokenId = this.draggingToken.getData('tokenId');
            const tok = this.tokens.find(t => t.id === tokenId);
            const baseMm = tok ? tok.baseMm : 32;
            const radiusInches = (baseMm / 25.4) / 2;
            const screenRadiusX = radiusInches * 64; 
            const screenRadiusY = screenRadiusX / 2; // Isometric ratio
            
            this.measurementLine.lineStyle(2, 0x00f2fe, 0.8);
            this.measurementLine.fillStyle(0x00f2fe, 0.2);
            this.measurementLine.strokeEllipse(targetX, targetY, screenRadiusX * 2, screenRadiusY * 2);
            this.measurementLine.fillEllipse(targetX, targetY, screenRadiusX * 2, screenRadiusY * 2);
        }

        // Draw queued attacks permanently on every frame
        if (this.queuedAttackLines && this.combatQueue) {
            this.queuedAttackLines.clear();
            const phase = this.gameState?.phase;
            const activeQueue = this.combatQueue.filter(q => q.phase === phase);
            
            if (activeQueue.length > 0) {
                for (const q of activeQueue) {
                    const attacker = this.tokens.find(t => t.id === q.attackerId);
                    const target = this.tokens.find(t => t.id === q.targetId);
                    if (attacker && target) {
                        const attPos = this.getIsoPoint(attacker.x, attacker.y);
                        const tgtPos = this.getIsoPoint(target.x, target.y);
                        
                        const hw = this.cameras.main.width / 2;
                        const hh = 200;
                        const attZ = attacker.z || 0;
                        const tgtZ = target.z || 0;
                        
                        const startX = attPos.x + hw;
                        const startY = attPos.y + hh - attZ - 15;
                        const endX = tgtPos.x + hw;
                        const endY = tgtPos.y + hh - tgtZ - 15;

                        // Red line
                        this.queuedAttackLines.lineStyle(3, 0xff0000, 0.8);
                        this.queuedAttackLines.strokeLineShape(new Phaser.Geom.Line(startX, startY, endX, endY));
                        
                        // Circle at target
                        this.queuedAttackLines.lineStyle(2, 0xff0000, 1.0);
                        this.queuedAttackLines.strokeCircle(endX, endY, 16);
                        
                        // Center dot
                        this.queuedAttackLines.fillStyle(0xff0000, 1.0);
                        this.queuedAttackLines.fillCircle(endX, endY, 4);
                    }
                }
            }
        }
    }

    rotateCamera(deltaYaw: number) {
        // Orbit around the center of the screen
        const camCenterX = this.cameras.main.scrollX + this.cameras.main.width / 2;
        const camCenterY = this.cameras.main.scrollY + this.cameras.main.height / 2;
        
        const centerGrid = this.getWorldPoint(camCenterX, camCenterY);
        
        this.cameraYaw += deltaYaw;
        
        const newWorldPt = this.getIsoPoint(centerGrid.x, centerGrid.y);
        const newWorldX = newWorldPt.x + this.cameras.main.width / 2;
        const newWorldY = newWorldPt.y + 200;
        
        this.cameras.main.scrollX = newWorldX - this.cameras.main.width / 2;
        this.cameras.main.scrollY = newWorldY - this.cameras.main.height / 2;
        
        this.updateBoardRender();
    }

    updateBoardRender() {
        if (!this.add || !this.cameras || !this.cameras.main) return;
        if (this.matImage && this.matContainer) {
            this.matImage.setRotation(this.cameraYaw + Math.PI / 4);
            // Update container position dynamically based on grid size
            const offsetX = (this.gridWidth / 2 - this.gridHeight / 2) * this.tileWidth;
            const offsetY = (this.gridWidth / 2 + this.gridHeight / 2) * this.tileHeight;
            this.matContainer.setPosition(this.cameras.main.width / 2 + offsetX, 200 + offsetY);
        }
        
        this.drawGrid();
        this.drawDeploymentZones();
        this.drawObjectives();
        this.redrawTerrain();
    }

    drawDeploymentZones() {
        if (!this.add || !this.cameras || !this.cameras.main) return;
        if (!this.deploymentGraphics) {
            this.deploymentGraphics = this.add.graphics();
            this.queuedAttackLines = this.add.graphics();
            this.marqueeGraphics = this.add.graphics(); this.marqueeGraphics.setDepth(9999);
            this.deploymentGraphics.setDepth(4);
        }
        this.deploymentGraphics.clear();

        const phase = this.gameState?.phase;
        const isDeployment = phase === 'deployment' || phase === 'roster';
        
        if (!isDeployment) return;

        const alphaFill = 0.16;
        const alphaBorder = 0.85;

        // 1. Zona de Despliegue Imperial (0" a 10" Flanco Izquierdo)
        const impPts = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: this.gridHeight },
            { x: 0, y: this.gridHeight }
        ].map(p => {
            const iso = this.getIsoPoint(p.x, p.y);
            return { x: iso.x + this.cameras.main.width / 2, y: iso.y + 200 };
        });

        this.deploymentGraphics.fillStyle(0x00f2fe, alphaFill);
        this.deploymentGraphics.lineStyle(3, 0x00f2fe, alphaBorder);
        this.deploymentGraphics.beginPath();
        this.deploymentGraphics.moveTo(impPts[0].x, impPts[0].y);
        for (let i = 1; i < impPts.length; i++) this.deploymentGraphics.lineTo(impPts[i].x, impPts[i].y);
        this.deploymentGraphics.closePath();
        this.deploymentGraphics.fill();
        this.deploymentGraphics.stroke();

        // 2. Zona de Despliegue del Caos (Últimas 10" Flanco Derecho)
        const chaosPts = [
            { x: this.gridWidth - 10, y: 0 },
            { x: this.gridWidth, y: 0 },
            { x: this.gridWidth, y: this.gridHeight },
            { x: this.gridWidth - 10, y: this.gridHeight }
        ].map(p => {
            const iso = this.getIsoPoint(p.x, p.y);
            return { x: iso.x + this.cameras.main.width / 2, y: iso.y + 200 };
        });

        this.deploymentGraphics.fillStyle(0xff2244, alphaFill);
        this.deploymentGraphics.lineStyle(3, 0xff2244, alphaBorder);
        this.deploymentGraphics.beginPath();
        this.deploymentGraphics.moveTo(chaosPts[0].x, chaosPts[0].y);
        for (let i = 1; i < chaosPts.length; i++) this.deploymentGraphics.lineTo(chaosPts[i].x, chaosPts[i].y);
        this.deploymentGraphics.closePath();
        this.deploymentGraphics.fill();
        this.deploymentGraphics.stroke();
    }

    drawObjectives() {
        if (!this.add || !this.cameras || !this.cameras.main) return;
        if (!this.objectiveGraphics) {
            this.objectiveGraphics = this.add.graphics();
            this.objectiveGraphics.setDepth(10);
        }
        this.objectiveGraphics.clear();
        
        const layoutId = this.gameState?.terrainLayout || "custom";
        const objs = getObjectivesForLayout(layoutId);
        
        objs.forEach(obj => {
            // Draw 40mm marker
            const rBase = 1.57 / 2; // radius in inches
            const rAura = rBase + 3; // 3" control range
            
            // Draw base
            this.drawIsoCircle(this.objectiveGraphics, obj.x, obj.y, rBase, 0xffaa00, 0.8, true);
            // Draw aura
            this.drawIsoCircle(this.objectiveGraphics, obj.x, obj.y, rAura, 0xffaa00, 0.2, false);
        });
    }

    drawIsoCircle(g: Phaser.GameObjects.Graphics, wx: number, wy: number, r: number, color: number, alpha: number, fill: boolean) {
        if (fill) {
            g.fillStyle(color, alpha);
            g.beginPath();
        } else {
            g.lineStyle(2, color, alpha);
            g.beginPath();
        }
        
        const segments = 32;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const px = wx + Math.cos(angle) * r;
            const py = wy + Math.sin(angle) * r;
            const iso = this.getIsoPoint(px, py);
            const sx = iso.x + this.cameras.main.width / 2;
            const sy = iso.y + 200;
            if (i === 0) g.moveTo(sx, sy);
            else g.lineTo(sx, sy);
        }
        
        if (fill) {
            g.closePath();
            g.fill();
        } else {
            g.strokePath();
        }
    }

    // Shooting Animation (Disparo: Charge-up Energy Orb, Muzzle Blast, Flying Laser Bolt, Impact Explosion)
    playShootAnimation(attackerId: string, targetId: string, color = 0x00f2fe) {
        if (!this.add) return;
        const attackerTok = this.tokens.find(t => t.id === attackerId);
        const targetTok = this.tokens.find(t => t.id === targetId);
        if (!attackerTok || !targetTok) return;

        const startIso = this.getIsoPoint(attackerTok.x, attackerTok.y);
        const startX = startIso.x + this.cameras.main.width / 2;
        const startY = startIso.y + 200 - (attackerTok.z || 0);

        const endIso = this.getIsoPoint(targetTok.x, targetTok.y);
        const endX = endIso.x + this.cameras.main.width / 2;
        const endY = endIso.y + 200 - (targetTok.z || 0);

        // Find attacker sprite to apply energy vibration pulse
        const hasValidGroup = this.tokenSprites && (this.tokenSprites as any).children && Array.isArray((this.tokenSprites as any).children.entries);
        const attackerSprite = hasValidGroup
            ? (this.tokenSprites.getChildren().find((s: any) => s && typeof s.getData === 'function' && s.getData('tokenId') === attackerId) as Phaser.GameObjects.Sprite)
            : null;

        if (attackerSprite) {
            this.tweens.add({
                targets: attackerSprite,
                scaleX: 1.12,
                scaleY: 1.12,
                duration: 80,
                yoyo: true,
                repeat: 3
            });
        }

        // --- STEP 1: CHARGING ENERGY ORB & INWARD RING OVER 350ms ---
        const chargeRing = this.add.circle(startX, startY - 10, 36, color, 0.2);
        chargeRing.setStrokeStyle(3, color, 0.9);
        chargeRing.setDepth(999);

        const chargeCore = this.add.circle(startX, startY - 10, 4, 0xffffff, 1.0);
        chargeCore.setDepth(999);

        this.tweens.add({
            targets: chargeRing,
            scale: 0.2,
            alpha: 1.0,
            duration: 350,
            ease: 'Cubic.easeIn'
        });

        this.tweens.add({
            targets: chargeCore,
            scale: 3.5,
            duration: 350,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                chargeRing.destroy();
                chargeCore.destroy();

                // --- STEP 2: MUZZLE BLAST & LASER BEAM LAUNCH ---
                const flash = this.add.circle(startX, startY - 10, 24, color, 1.0);
                flash.setDepth(999);
                this.tweens.add({
                    targets: flash,
                    scale: 2.5,
                    alpha: 0,
                    duration: 200,
                    onComplete: () => flash.destroy()
                });

                const laserG = this.add.graphics();
                laserG.setDepth(999);

                const dummy = { t: 0 };
                this.tweens.add({
                    targets: dummy,
                    t: 1,
                    duration: 380,
                    ease: 'Power1',
                    onUpdate: () => {
                        laserG.clear();
                        const curX = Phaser.Math.Linear(startX, endX, dummy.t);
                        const curY = Phaser.Math.Linear(startY - 10, endY - 10, dummy.t);
                        const trailX = Phaser.Math.Linear(startX, endX, Math.max(0, dummy.t - 0.35));
                        const trailY = Phaser.Math.Linear(startY - 10, endY - 10, Math.max(0, dummy.t - 0.35));

                        // Outer Laser Glow Line
                        laserG.lineStyle(10, color, 0.8);
                        laserG.strokeLineShape(new Phaser.Geom.Line(trailX, trailY, curX, curY));

                        // Inner Core Line
                        laserG.lineStyle(4, 0xffffff, 1.0);
                        laserG.strokeLineShape(new Phaser.Geom.Line(trailX, trailY, curX, curY));

                        // Energy Bullet Head
                        laserG.fillStyle(0xffffff, 1.0);
                        laserG.fillCircle(curX, curY, 7);
                    },
                    onComplete: () => {
                        laserG.destroy();

                        // --- STEP 3: IMPACT EXPLOSION & TARGET SHAKE ---
                        const impact = this.add.circle(endX, endY - 10, 24, 0xff4400, 1.0);
                        impact.setDepth(999);
                        this.tweens.add({
                            targets: impact,
                            scale: 2.8,
                            alpha: 0,
                            duration: 250,
                            onComplete: () => impact.destroy()
                        });
                        
                        // Shake target mini upon impact!
                        this.playDamageAnimation(targetId, 0);
                    }
                });
            }
        });
    }

    // Damage Received Animation (Recibir Daño: Shake Red, Floating HP Loss text)
    playDamageAnimation(targetId: string, damage = 0) {
        if (!this.tokenSprites || !(this.tokenSprites as any).children || !Array.isArray((this.tokenSprites as any).children.entries)) return;
        const children = this.tokenSprites.getChildren();
        if (!children || !Array.isArray(children)) return;

        const sprite = children.find(
            (s: any) => s && typeof s.getData === 'function' && s.getData('tokenId') === targetId
        ) as Phaser.GameObjects.Sprite;

        if (!sprite) return;

        // 1. Flash Red & Shake Miniature Sprite
        sprite.setTint(0xff3333);
        const origX = sprite.x;
        this.tweens.add({
            targets: sprite,
            x: origX + 6,
            duration: 35,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
                sprite.x = origX;
                sprite.clearTint();
            }
        });

        // 2. Floating Damage Text (-Dmg HP)
        if (damage > 0 && this.add) {
            const dmgText = this.add.text(
                sprite.x,
                sprite.y - 25,
                `-${damage} HP`,
                {
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    fontStyle: 'bold',
                    color: '#ff2222',
                    stroke: '#000000',
                    strokeThickness: 4
                }
            );
            dmgText.setOrigin(0.5);
            dmgText.setDepth(250);

            this.tweens.add({
                targets: dmgText,
                y: sprite.y - 65,
                alpha: 0,
                scale: 1.3,
                duration: 900,
                ease: 'Cubic.easeOut',
                onComplete: () => dmgText.destroy()
            });
        }
    }

    // Teleport Spawn Animation (Animación de Teletransportación al desplegar unidad)
    playTeleportAnimation(wx: number, wy: number, color = 0x00f2fe) {
        if (!this.add) return;
        const el = this.getElevationInfo(wx, wy);
        const iso = this.getIsoPoint(wx, wy);
        const sx = iso.x + this.cameras.main.width / 2;
        const sy = iso.y + 200 - el.z;

        // Hide ghost preview immediately upon placement
        if (this.ghostContainer) {
            this.ghostContainer.setVisible(false);
        }

        // 1. Vertical Beam of Warp / Disformidad Light striking from space (startY: -300)
        const beam = this.add.rectangle(sx, sy - 150, 18, 300, color, 0.95);
        beam.setDepth(999);

        this.tweens.add({
            targets: beam,
            scaleX: 0,
            alpha: 0,
            duration: 400,
            ease: 'Cubic.easeOut',
            onComplete: () => beam.destroy()
        });

        // 2. White-hot Teleport Burst Flash at Ground Zero
        const flash = this.add.circle(sx, sy - 10, 26, 0xffffff, 1.0);
        flash.setDepth(999);
        this.tweens.add({
            targets: flash,
            scale: 2.4,
            alpha: 0,
            duration: 280,
            onComplete: () => flash.destroy()
        });

        // 3. Shockwave Aura Ring Expanding Outward
        const shockG = this.add.graphics();
        shockG.setDepth(998);

        const dummy = { r: 0.5, a: 1.0 };
        this.tweens.add({
            targets: dummy,
            r: 3.5,
            a: 0,
            duration: 450,
            ease: 'Power2',
            onUpdate: () => {
                shockG.clear();
                this.drawIsoCircle(shockG, wx, wy, dummy.r, color, dummy.a, false);
            },
            onComplete: () => shockG.destroy()
        });
    }

    playDeploymentIntroAnimation() {
        if (!this.add || !this.cameras || !this.cameras.main) return;
        const camW = this.cameras.main.width;
        const camH = this.cameras.main.height;

        // 1. Full-screen warp flash
        const flashG = this.add.graphics();
        flashG.setDepth(9990);
        flashG.fillStyle(0x00f2fe, 0.0);
        flashG.fillRect(0, 0, camW, camH);
        const flashDummy = { a: 0.0 };
        this.tweens.add({
            targets: flashDummy,
            a: 0.45,
            duration: 120,
            ease: 'Power2',
            yoyo: true,
            repeat: 1,
            onUpdate: () => {
                flashG.clear();
                flashG.fillStyle(0x00f2fe, flashDummy.a);
                flashG.fillRect(0, 0, camW, camH);
            },
            onComplete: () => flashG.destroy()
        });

        // 2. Scanning warp-light beam that sweeps across the board left→right
        const beamG = this.add.graphics();
        beamG.setDepth(9989);
        const beamDummy = { px: -100 };
        this.tweens.add({
            targets: beamDummy,
            px: camW + 100,
            duration: 900,
            delay: 100,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
                beamG.clear();
                // Vertical glow beam
                const bx = beamDummy.px;
                const grad = beamG.fillGradientStyle(0x00f2fe, 0x00f2fe, 0x00f2fe, 0x00f2fe, 0, 0.5, 0.5, 0);
                beamG.fillRect(bx - 40, 0, 80, camH);
            },
            onComplete: () => beamG.destroy()
        });

        // 3. Ground pulse ring across the whole map center
        const cx = this.gridWidth / 2;
        const cy = this.gridHeight / 2;
        const ringG = this.add.graphics();
        ringG.setDepth(9988);
        const ringDummy = { r: 0, a: 0.9 };
        this.tweens.add({
            targets: ringDummy,
            r: 80,
            a: 0,
            duration: 1000,
            delay: 200,
            ease: 'Power1',
            onUpdate: () => {
                ringG.clear();
                this.drawIsoCircle(ringG, cx, cy, ringDummy.r, 0x00f2fe, ringDummy.a, false);
            },
            onComplete: () => ringG.destroy()
        });

        // 4. Zone pulse — imperial zone flares up blue, chaos zone flares up red
        if (this.deploymentGraphics) {
            const zoneDummy = { alpha: 0.8 };
            this.tweens.add({
                targets: zoneDummy,
                alpha: 0.06,
                duration: 1200,
                delay: 300,
                ease: 'Power3',
                onUpdate: () => this.drawDeploymentZones()
            });
        }

        // 5. Title text "LA BATALLA COMIENZA"
        const titleText = this.add.text(camW / 2, camH / 2 - 40, '⚔️  ¡LA BATALLA COMIENZA!  ⚔️', {
            fontFamily: 'monospace',
            fontSize: '22px',
            fontStyle: 'bold',
            color: '#00f2fe',
            stroke: '#000000',
            strokeThickness: 4,
            shadow: { offsetX: 0, offsetY: 0, color: '#00f2fe', blur: 18, fill: true }
        });
        titleText.setOrigin(0.5);
        titleText.setDepth(9991);
        titleText.setAlpha(0);
        this.tweens.add({
            targets: titleText,
            alpha: 1,
            duration: 350,
            delay: 150,
            ease: 'Power2',
            yoyo: true,
            hold: 900,
            onComplete: () => titleText.destroy()
        });
    }
}
