import Phaser from 'phaser';
import { EventBus } from './EventBus';
import { BOARD_WIDTH_IN, BOARD_HEIGHT_IN, DATASHEETS } from './constants';
import { GameState, Token, Terrain, Unit } from './types';
import { getObjectivesForLayout } from './constants';
import { CameraManager } from './rendering/managers/CameraManager';
import { TokenRenderer } from './rendering/managers/TokenRenderer';
import { TerrainRenderer } from './rendering/managers/TerrainRenderer';
import { InputManager } from './scene/InputManager';
import { InteractionManager } from './scene/InteractionManager';
import { useGameStore } from '../store/gameStore';
import { useUIStore } from '../store/uiStore';

import { PhysicsManager } from './rendering/managers/PhysicsManager';

export class BoardScene extends Phaser.Scene {
    public gridWidth = 60;
    public gridHeight = 44;
    public tileWidth = 32; // scale factor for X
    public tileHeight = 16; // scale factor for Y
    
    public cameraManager!: CameraManager;
    public tokenRenderer!: TokenRenderer;
    public terrainRenderer!: TerrainRenderer;
    public inputManager!: InputManager;
    public interactionManager!: InteractionManager;

    // 3D Camera Rotation (Yaw) & Smoothing Targets
    public cameraYaw = 0;
    public targetScrollX = 0;
    public targetScrollY = 0;
    public targetZoom = 1.0;
    public targetYaw = 0;

    // Game state references
    public gameState: GameState | null = null;
    public tokens: Token[] = [];
    public units: Unit[] = [];
    public terrain: Terrain[] = [];
    public combatQueue: any[] = [];
    
    // Phaser groups
    public tokenSprites!: Phaser.GameObjects.Group;
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
    public selectedIds: string[] = [];
    
    // Multi-dragging
    public dragGroup: { sprite: Phaser.GameObjects.Sprite, startWorldX: number, startWorldY: number, startZ: number }[] | null = null;
    public isMeasuringMode = false;
    public isMultiSelectMode = false;
    public prevPhase: string | null = null;
    
    public keyW?: Phaser.Input.Keyboard.Key;
    public keyA?: Phaser.Input.Keyboard.Key;
    public keyS?: Phaser.Input.Keyboard.Key;
    public keyD?: Phaser.Input.Keyboard.Key;

    constructor() {
        super('BoardScene');
    }

    preload() {
        // Load assets
        this.load.image('battlemat', (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/assets/battlemat_topdown.png');
        this.load.image('raw_token_imperium', (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/assets/token_imperium.png');
        this.load.image('raw_token_chaos', (process.env.NEXT_PUBLIC_BASE_PATH || '') + '/assets/token_chaos.png');
        
        // Load per-unit miniature images
        DATASHEETS.forEach(ds => {
            if (ds.image) {
                this.load.image(`raw_mini_${ds.id}`, ds.image);
            }
        });
    }

    create() {
        this.tokenRenderer = new TokenRenderer(this);
        this.terrainRenderer = new TerrainRenderer(this);

        // Pre-process green screen images to create transparent tokens
        this.tokenRenderer.createTransparentTexture('raw_token_imperium', 'token_imperium');
        this.tokenRenderer.createTransparentTexture('raw_token_chaos', 'token_chaos');
        
        // Pre-process miniature images
        DATASHEETS.forEach(ds => {
            if (ds.image) {
                this.tokenRenderer.createTransparentTexture(`raw_mini_${ds.id}`, `mini_${ds.id}`);
            }
        });
        
        // Generate simple ambient noise texture
        this.terrainRenderer.generateNoiseTexture();

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
        this.terrainRenderer.drawGrid();

        this.tokenSprites = this.add.group();


        this.cameraManager = new CameraManager(this);

        if (this.input && this.input.keyboard) {
            this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
            this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        }

        // Listen for React updates via Zustand
        useGameStore.subscribe((state, prevState) => {
            const prevLayout = prevState?.game?.terrainLayout;
            const prevPhase = prevState?.game?.phase;
            this.gameState = state.game;
            this.prevPhase = state.game.phase;
            this.tokens = state.tokens;
            this.units = state.units || [];
            this.terrain = state.terrainState;
            
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
                // Only do standard redraws if layout didn't change
                this.terrainRenderer.redrawTerrain();
                this.drawDeploymentZones();
                this.drawObjectives();
            }

            if (prevPhase === 'roster' && state.game.phase === 'deployment') {
                this.playDeploymentIntroAnimation();
            }
            this.tokenRenderer.renderTokens();
        });

        useUIStore.subscribe((state) => {
            this.selectedIds = state.selectedIds || [];
            this.combatQueue = state.combatQueue || [];
            this.deployingUnitId = state.deployingUnitId || null;
            if (!this.deployingUnitId && this.ghostContainer) {
                this.ghostContainer.setVisible(false);
            }
        });

        EventBus.on('sync-ui-modes', (data: { isMeasuring?: boolean, isMultiSelectMode?: boolean }) => {
            this.isMeasuringMode = !!data.isMeasuring;
            this.isMultiSelectMode = !!data.isMultiSelectMode;
            if (!this.isMeasuringMode && this.measurementLine && this.measurementText) {
                this.measurementLine.clear();
                this.measurementText.setVisible(false);
            }
        });

        this.interactionManager = new InteractionManager(this);
        this.interactionManager.setupInteractions();


        this.inputManager = new InputManager(this);
        this.inputManager.setupInput();

        // External Camera Control Events from UI Buttons (Moved to CameraManager)
        EventBus.on('animate-shoot', (data: { attackerId: string, targetId: string, color?: number }) => {
            this.playShootAnimation(data.attackerId, data.targetId, data.color);
        });
        EventBus.on('animate-damage', (data: { targetId: string, damage?: number }) => {
            this.playDamageAnimation(data.targetId, data.damage || 0);
        });
        EventBus.on('animate-teleport', (data: { x: number, y: number, color?: number }) => {
            this.playTeleportAnimation(data.x, data.y, data.color);
        });

        // Setup keyboard handled by InputManager

        EventBus.emit('scene-ready');
    }
    // Methods moved to PhysicsManager

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

    // (Texture removal method extracted to TokenRenderer)



    setupDragHandlers() {
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
            
            let el = PhysicsManager.getElevationInfo(currentWorld.x, currentWorld.y, this.terrain);
            currentWorld = PhysicsManager.resolveWallCollisions(currentWorld.x, currentWorld.y, el.z, radius, this.terrain);
            
            // Re-evaluate elevation in case collision pushed us onto/off a platform
            el = PhysicsManager.getElevationInfo(currentWorld.x, currentWorld.y, this.terrain);
            
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
                    
                    let mel = PhysicsManager.getElevationInfo(mx, my, this.terrain);
                    let mResolved = PhysicsManager.resolveWallCollisions(mx, my, mel.z, mRadius, this.terrain);
                    mel = PhysicsManager.getElevationInfo(mResolved.x, mResolved.y, this.terrain);
                    
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
                const el = PhysicsManager.getElevationInfo(endWorld.x, endWorld.y, this.terrain);
                moves.push({ id: gameObject.getData('tokenId'), x: endWorld.x, y: endWorld.y, z: el.z });
                
                if (this.dragGroup) {
                    for (const member of this.dragGroup) {
                        const mTargetX = member.sprite.getData('targetX');
                        const mTargetY = member.sprite.getData('targetY');
                        const mEndWorld = this.getWorldPoint(mTargetX, mTargetY + (member.sprite.getData('z') || 0));
                        const mel = PhysicsManager.getElevationInfo(mEndWorld.x, mEndWorld.y, this.terrain);
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
        if (!this.gameState || !this.tokenSprites) return;
        
        this.cameraManager.update(time, delta);
        // Sync the scene's cameraYaw with CameraManager for rendering math
        this.cameraYaw = this.cameraManager.cameraYaw;

        // --- KEYBOARD CAMERA PANNING ---
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
        
        this.terrainRenderer.drawGrid();
        this.drawDeploymentZones();
        this.drawObjectives();
        this.terrainRenderer.redrawTerrain();
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
        const el = PhysicsManager.getElevationInfo(wx, wy, this.terrain);
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
