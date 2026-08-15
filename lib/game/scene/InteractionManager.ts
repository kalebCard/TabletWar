import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';
import { EventBus } from '../EventBus';
import { PhysicsManager } from '../rendering/managers/PhysicsManager';

export class InteractionManager {
    private scene: BoardScene;

    constructor(scene: BoardScene) {
        this.scene = scene;
    }

    public setupInteractions() {
        this.setupPointerEvents();
        this.setupDragHandlers();
    }

    private setupPointerEvents() {
        // Disable context menu so right click panning works smoothly
        this.scene.input.mouse?.disableContextMenu();
        this.scene.measurementLine = this.scene.add.graphics();
        this.scene.measurementLine.setDepth(9999);
        
        this.scene.queuedAttackLines = this.scene.add.graphics();
        this.scene.queuedAttackLines.setDepth(9998);
        
        this.scene.measurementText = this.scene.add.text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#00ff00',
            backgroundColor: '#000000AA',
            padding: { x: 6, y: 4 }
        });
        this.scene.measurementText.setDepth(10000);
        this.scene.measurementText.setVisible(false);

        // Handle Map Clicks
        this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown() && pointer.event?.ctrlKey) {
                this.scene.measureStartWorld = this.scene.getWorldPoint(pointer.worldX, pointer.worldY);
            }
            if (pointer.leftButtonDown() && pointer.event?.shiftKey) {
                this.scene.marqueeStartWorld = { x: pointer.worldX, y: pointer.worldY };
            }
        });

        this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
            if (this.scene.draggingTerrain) {
                const currentWorld = this.scene.getWorldPoint(pointer.worldX, pointer.worldY);
                const startWorld = this.scene.getWorldPoint(this.scene.draggingTerrain.startWorldX, this.scene.draggingTerrain.startWorldY);
                const dx = currentWorld.x - startWorld.x;
                const dy = currentWorld.y - startWorld.y;
                EventBus.emit('ui-move-terrain', [{ id: this.scene.draggingTerrain.id, dx, dy }]);
                this.scene.draggingTerrain = null;
                return;
            }

            if (this.scene.measureStartWorld) {
                this.scene.measureStartWorld = null;
                this.scene.measurementLine?.clear();
                this.scene.measurementText?.setVisible(false);
            }

            if (this.scene.marqueeStartWorld) {
                const dist = Math.hypot(pointer.worldX - this.scene.marqueeStartWorld.x, pointer.worldY - this.scene.marqueeStartWorld.y);
                if (dist > 10) {
                    const rect = new Phaser.Geom.Rectangle(
                        Math.min(this.scene.marqueeStartWorld.x, pointer.worldX),
                        Math.min(this.scene.marqueeStartWorld.y, pointer.worldY),
                        Math.abs(pointer.worldX - this.scene.marqueeStartWorld.x),
                        Math.abs(pointer.worldY - this.scene.marqueeStartWorld.y)
                    );
                    
                    const selectedIds: string[] = [];
                    this.scene.tokenSprites.getChildren().forEach((child: any) => {
                        const sprite = child as Phaser.GameObjects.Sprite;
                        if (Phaser.Geom.Rectangle.Contains(rect, sprite.x, sprite.y)) {
                            selectedIds.push(sprite.getData('tokenId'));
                        }
                    });
                    
                    if (selectedIds.length > 0) {
                        EventBus.emit('ui-select', selectedIds);
                    }
                }
                this.scene.marqueeStartWorld = null;
                this.scene.marqueeGraphics.clear();
            }

            if (pointer.rightButtonReleased() || pointer.middleButtonReleased()) return;
            // Check if it was a click and not a drag (increase threshold for mobile touch taps)
            const tapThreshold = pointer.wasTouch ? 15 : 5;
            if (Math.abs(pointer.downX - pointer.upX) < tapThreshold && Math.abs(pointer.downY - pointer.upY) < tapThreshold) {
                if (gameObjects.length === 0) {
                    const worldPt = this.scene.getWorldPoint(pointer.worldX, pointer.worldY);
                    EventBus.emit('ui-map-click', worldPt);
                }
            }
        });

        // Multi-touch support for mobile devices
        this.scene.input.addPointer(2);

        // Track last pinch distance and angle for 2-finger mobile zoom, pan & twist rotation
        let lastMid: { x: number, y: number } | null = null;
        let lastPinchDist = 0;
        let lastPinchAngle = 0;

        // Setup camera controls
        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            // 2-finger touch gesture: Zoom, Pan & Twist Rotation for mobile
            if (this.scene.input.pointer1.isDown && this.scene.input.pointer2.isDown) {
                const p1 = this.scene.input.pointer1;
                const p2 = this.scene.input.pointer2;

                const currentMidX = (p1.x + p2.x) / 2;
                const currentMidY = (p1.y + p2.y) / 2;
                const currentDist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
                const currentAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

                if (lastMid && lastPinchDist > 0) {
                    // 1. Pan movement using exact midpoint difference
                    const midDx = (currentMidX - lastMid.x) / this.scene.cameras.main.zoom;
                    const midDy = (currentMidY - lastMid.y) / this.scene.cameras.main.zoom;
                    this.scene.cameras.main.scrollX -= midDx;
                    this.scene.cameras.main.scrollY -= midDy;

                    // 2. Pinch distance for Zoom
                    const distDiff = currentDist - lastPinchDist;
                    if (Math.abs(distDiff) > 1.0) {
                        const zoomDelta = distDiff * 0.003;
                        const newZoom = Phaser.Math.Clamp(this.scene.cameras.main.zoom + zoomDelta, 0.3, 3);
                        this.scene.cameras.main.setZoom(newZoom);
                    }

                    // 3. Twist Angle for 3D Isometric Camera Rotation
                    if (lastPinchAngle !== 0) {
                        let angleDelta = currentAngle - lastPinchAngle;
                        if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
                        if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

                        if (Math.abs(angleDelta) > 0.02) {
                            this.scene.rotateCamera(angleDelta);
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
            if (this.scene.deployingUnitId) {
                const screenX = pointer.worldX;
                const screenY = pointer.worldY;
                const worldPt = this.scene.getWorldPoint(screenX, screenY);
                const el = PhysicsManager.getElevationInfo(worldPt.x, worldPt.y, this.scene.terrain);
                const sx = screenX;
                const sy = screenY;

                if (!this.scene.ghostContainer && this.scene.add) {
                    this.scene.ghostContainer = this.scene.add.container(sx, sy);
                    this.scene.ghostContainer.setDepth(995);

                    const circleG = this.scene.add.graphics();
                    circleG.fillStyle(0x00f2fe, 0.35);
                    circleG.lineStyle(2, 0x00f2fe, 0.9);

                    const segments = 24;
                    const r = 1.0;
                    circleG.beginPath();
                    for (let i = 0; i <= segments; i++) {
                        const angle = (i / segments) * Math.PI * 2;
                        const px = Math.cos(angle) * r;
                        const py = Math.sin(angle) * r;
                        const rad = this.scene.cameraYaw || 0;
                        const ix = px * Math.cos(rad) - py * Math.sin(rad);
                        const iy = (px * Math.sin(rad) + py * Math.cos(rad)) * 0.5;
                        if (i === 0) circleG.moveTo(ix, iy);
                        else circleG.lineTo(ix, iy);
                    }
                    circleG.closePath();
                    circleG.fill();
                    circleG.stroke();

                    const ghostText = this.scene.add.text(0, -25, "DESPLEGAR", {
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontStyle: 'bold',
                        color: '#00f2fe',
                        backgroundColor: '#000000AA',
                        padding: { x: 4, y: 2 }
                    });
                    ghostText.setOrigin(0.5);

                    this.scene.ghostContainer.add([circleG, ghostText]);
                } else if (this.scene.ghostContainer) {
                    this.scene.ghostContainer.setPosition(sx, sy);
                    this.scene.ghostContainer.setVisible(true);
                }
            } else if (this.scene.ghostContainer) {
                this.scene.ghostContainer.setVisible(false);
            }

            const isMeasuringActive = !!(this.scene.measureStartWorld || (this.scene.isMeasuringMode && (pointer.isDown || pointer.wasTouch)));
            if (isMeasuringActive && this.scene.measurementLine && this.scene.measurementText) {
                const startWorld = this.scene.measureStartWorld || { x: 30, y: 22 };
                const currentWorld = this.scene.getWorldPoint(pointer.worldX, pointer.worldY);
                const dx = currentWorld.x - startWorld.x;
                const dy = currentWorld.y - startWorld.y;
                const distance = Math.hypot(dx, dy);
                
                this.scene.measurementLine.clear();
                this.scene.measurementLine.lineStyle(3, 0xfbbf24, 0.95);
                
                const startScreen = this.scene.getIsoPoint(startWorld.x, startWorld.y);
                this.scene.measurementLine.strokeLineShape(new Phaser.Geom.Line(
                    startScreen.x + this.scene.cameras.main.width / 2, 
                    startScreen.y + 200, 
                    pointer.worldX, 
                    pointer.worldY
                ));

                this.scene.measurementText.setText(`${distance.toFixed(1)}"`);
                this.scene.measurementText.setPosition(pointer.worldX + 15, pointer.worldY - 15);
                this.scene.measurementText.setVisible(true);
                return; // block panning while measuring
            }

            if (!pointer.isDown) return;

            // Rotate: Middle click OR Alt + Left click
            const isRotate = pointer.middleButtonDown() || (pointer.leftButtonDown() && pointer.event?.altKey);
            // Pan: Right click OR Left click on empty space OR 1-finger touch drag on empty space
            const isTouchPan = pointer.wasTouch && !this.scene.draggingToken && !this.scene.draggingTerrain;
            const isMousePan = pointer.rightButtonDown() || (pointer.leftButtonDown() && !this.scene.draggingToken && !this.scene.draggingTerrain && !isRotate && !pointer.event?.shiftKey && !pointer.event?.ctrlKey);
            const isPan = isTouchPan || isMousePan;

            if (this.scene.marqueeStartWorld && pointer.isDown) {
                this.scene.marqueeGraphics.clear();
                this.scene.marqueeGraphics.lineStyle(2, 0x00ffff, 1);
                this.scene.marqueeGraphics.fillStyle(0x00ffff, 0.2);
                const rect = new Phaser.Geom.Rectangle(
                    Math.min(this.scene.marqueeStartWorld.x, pointer.worldX),
                    Math.min(this.scene.marqueeStartWorld.y, pointer.worldY),
                    Math.abs(pointer.worldX - this.scene.marqueeStartWorld.x),
                    Math.abs(pointer.worldY - this.scene.marqueeStartWorld.y)
                );
                this.scene.marqueeGraphics.fillRectShape(rect);
                this.scene.marqueeGraphics.strokeRectShape(rect);
                return;
            }

            if (this.scene.draggingTerrain) {
                const dx = pointer.worldX - this.scene.draggingTerrain.startWorldX;
                const dy = pointer.worldY - this.scene.draggingTerrain.startWorldY;
                this.scene.draggingTerrain.frontG.x = dx;
                this.scene.draggingTerrain.frontG.y = dy;
                this.scene.draggingTerrain.backG.x = dx;
                this.scene.draggingTerrain.backG.y = dy;
                return;
            }

            if (isPan) {
                const dx = (pointer.x - pointer.prevPosition.x) / this.scene.cameras.main.zoom;
                const dy = (pointer.y - pointer.prevPosition.y) / this.scene.cameras.main.zoom;
                this.scene.cameras.main.scrollX -= dx;
                this.scene.cameras.main.scrollY -= dy;
            } else if (isRotate) {
                const dx = pointer.x - pointer.prevPosition.x;
                this.scene.rotateCamera(dx * 0.008);
            }
        });
    }

    private setupDragHandlers() {
        this.scene.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
            this.scene.draggingToken = gameObject;
            this.scene.dragStartWorld = { x: gameObject.getData('worldX'), y: gameObject.getData('worldY') };
            this.scene.dragStartElevation = gameObject.getData('z') || 0;
            gameObject.setData('dragOffsetX', gameObject.x - pointer.worldX);
            gameObject.setData('dragOffsetY', gameObject.y - pointer.worldY);
            gameObject.setData('targetX', gameObject.x);
            gameObject.setData('targetY', gameObject.y);
            
            this.scene.dragGroup = null;
            const draggedId = gameObject.getData('tokenId');
            const selectedIds = this.scene.selectedIds;
            if (selectedIds.includes(draggedId) && selectedIds.length > 1) {
                this.scene.dragGroup = [];
                const sprites = this.scene.tokenSprites.getChildren() as Phaser.GameObjects.Sprite[];
                for (const sprite of sprites) {
                    const id = sprite.getData('tokenId');
                    if (selectedIds.includes(id) && id !== draggedId) {
                        this.scene.dragGroup.push({
                            sprite,
                            startWorldX: sprite.getData('worldX'),
                            startWorldY: sprite.getData('worldY'),
                            startZ: sprite.getData('z') || 0
                        });
                    }
                }
            }
        });

        this.scene.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
            const phase = this.scene.gameState?.phase;
            const isCombatPhase = phase === 'shooting' || phase === 'fight';

            if (isCombatPhase) {
                this.scene.measurementLine.clear();
                
                const attackerTok = this.scene.tokens.find((t: any) => t.id === gameObject.getData('tokenId'));
                let maxRange = 999;
                if (attackerTok && phase === 'shooting') {
                    const ranged = attackerTok.weapons.filter((w: any) => w.type === 'ranged');
                    maxRange = ranged.length > 0 ? Math.max(...ranged.map((w: any) => w.range)) : 0;
                } else if (attackerTok && phase === 'fight') {
                    maxRange = 1;
                }

                const targetX = pointer.worldX;
                const targetY = pointer.worldY;
                
                const currentWorld = this.scene.getWorldPoint(targetX, targetY);
                const attackerWorld = { x: attackerTok?.x || 0, y: attackerTok?.y || 0 };
                const distInches = Math.hypot(currentWorld.x - attackerWorld.x, currentWorld.y - attackerWorld.y);
                const outOfRange = distInches > maxRange;
                
                const lineColor = outOfRange ? 0x888888 : 0xff0000;
                
                this.scene.measurementLine.lineStyle(3, lineColor, 0.9);
                this.scene.measurementLine.strokeLineShape(new Phaser.Geom.Line(
                    gameObject.x, 
                    gameObject.y, 
                    targetX, 
                    targetY
                ));
                
                this.scene.measurementLine.lineStyle(2, lineColor, 1.0);
                this.scene.measurementLine.strokeCircle(targetX, targetY, 16);
                
                this.scene.measurementLine.fillStyle(lineColor, 1.0);
                this.scene.measurementLine.fillCircle(targetX, targetY, 4);
                return;
            }

            let targetX = pointer.worldX + gameObject.getData('dragOffsetX');
            let targetY = pointer.worldY + gameObject.getData('dragOffsetY');

            let currentWorld = this.scene.getWorldPoint(targetX, targetY + this.scene.dragStartElevation);
            
            const tokenId = gameObject.getData('tokenId');
            const tok = this.scene.tokens.find((t: any) => t.id === tokenId);

            const unit = tok ? this.scene.units.find((u: any) => u.id === tok.unitId) : null;
            const hasAlreadyMoved = !!tok?.moved;

            if (this.scene.dragStartWorld && tok && phase !== 'deployment') {
                const baseMove = tok.stats.move || 6;
                const advanceBonus = unit?.advanced ? (unit.advanceRoll || 0) : 0;
                const isMovementPhase = phase === 'movement';
                const maxMove = (hasAlreadyMoved || !isMovementPhase) ? 0 : (baseMove + advanceBonus);

                const dx = currentWorld.x - this.scene.dragStartWorld.x;
                const dy = currentWorld.y - this.scene.dragStartWorld.y;
                const dist = Math.hypot(dx, dy);

                if (dist > maxMove) {
                    if (maxMove === 0) {
                        currentWorld.x = this.scene.dragStartWorld.x;
                        currentWorld.y = this.scene.dragStartWorld.y;
                    } else if (dist > 0) {
                        currentWorld.x = this.scene.dragStartWorld.x + (dx / dist) * maxMove;
                        currentWorld.y = this.scene.dragStartWorld.y + (dy / dist) * maxMove;
                    }
                }
            }

            const baseMm = tok ? tok.baseMm : 32;
            const radius = (baseMm / 25.4) / 2;
            
            let el = PhysicsManager.getElevationInfo(currentWorld.x, currentWorld.y, this.scene.terrain);
            currentWorld = PhysicsManager.resolveWallCollisions(currentWorld.x, currentWorld.y, el.z, radius, this.scene.terrain);
            
            el = PhysicsManager.getElevationInfo(currentWorld.x, currentWorld.y, this.scene.terrain);
            
            const iso = this.scene.getIsoPoint(currentWorld.x, currentWorld.y);
            targetX = iso.x + this.scene.cameras.main.width / 2;
            targetY = iso.y + 200 - el.z;
            
            gameObject.setData('z', el.z);
            gameObject.setData('terrainId', el.terrainId);
            
            gameObject.setData('targetX', targetX);
            gameObject.setData('targetY', targetY);
            
            if (this.scene.dragGroup && this.scene.dragStartWorld) {
                const deltaWorldX = currentWorld.x - this.scene.dragStartWorld.x;
                const deltaWorldY = currentWorld.y - this.scene.dragStartWorld.y;
                for (const member of this.scene.dragGroup) {
                    let mx = member.startWorldX + deltaWorldX;
                    let my = member.startWorldY + deltaWorldY;
                    
                    const mTokenId = member.sprite.getData('tokenId');
                    const mTok = this.scene.tokens.find((t: any) => t.id === mTokenId);
                    const mbaseMm = mTok ? mTok.baseMm : 32;
                    const mRadius = (mbaseMm / 25.4) / 2;
                    
                    let mel = PhysicsManager.getElevationInfo(mx, my, this.scene.terrain);
                    let mResolved = PhysicsManager.resolveWallCollisions(mx, my, mel.z, mRadius, this.scene.terrain);
                    mel = PhysicsManager.getElevationInfo(mResolved.x, mResolved.y, this.scene.terrain);
                    
                    const miso = this.scene.getIsoPoint(mResolved.x, mResolved.y);
                    const mTargetX = miso.x + this.scene.cameras.main.width / 2;
                    const mTargetY = miso.y + 200 - mel.z;
                    
                    member.sprite.setData('targetX', mTargetX);
                    member.sprite.setData('targetY', mTargetY);
                    member.sprite.setData('z', mel.z);
                    member.sprite.setData('terrainId', mel.terrainId);
                }
            }
            
            if (this.scene.dragStartWorld && this.scene.measurementLine && this.scene.measurementText) {
                const currentWorld = this.scene.getWorldPoint(targetX, targetY);
                const dx = currentWorld.x - this.scene.dragStartWorld.x;
                const dy = currentWorld.y - this.scene.dragStartWorld.y;
                const distance = Math.hypot(dx, dy); 
                
                this.scene.measurementLine.clear();
                this.scene.measurementLine.lineStyle(2, hasAlreadyMoved ? 0xff0000 : 0x00ff00, 1);
                
                const startScreen = this.scene.getIsoPoint(this.scene.dragStartWorld.x, this.scene.dragStartWorld.y);
                this.scene.measurementLine.strokeLineShape(new Phaser.Geom.Line(
                    startScreen.x + this.scene.cameras.main.width / 2, 
                    startScreen.y + 200, 
                    targetX, 
                    targetY
                ));
                
                if (hasAlreadyMoved) {
                    this.scene.measurementText.setText(`¡Ya movió!`);
                } else {
                    this.scene.measurementText.setText(`${distance.toFixed(1)}"`);
                }
                this.scene.measurementText.setPosition(targetX + 15, targetY - 15);
                this.scene.measurementText.setVisible(true);
            }
        });

        this.scene.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Sprite) => {
            const phase = this.scene.gameState?.phase;
            const isCombatPhase = phase === 'shooting' || phase === 'fight';

            if (isCombatPhase) {
                const pointerPoint = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
                let hitEnemyId = null;
                const attackerTok = this.scene.tokens.find((t: any) => t.id === gameObject.getData('tokenId'));
                
                const sprites = this.scene.tokenSprites.getChildren() as Phaser.GameObjects.Sprite[];
                for (const sprite of sprites) {
                    if (sprite === gameObject) continue;
                    
                    const targetTok = this.scene.tokens.find((t: any) => t.id === sprite.getData('tokenId'));
                    if (!targetTok || !attackerTok || targetTok.faction === attackerTok.faction) continue;
                    
                    const dist = Phaser.Math.Distance.Between(pointerPoint.x, pointerPoint.y, sprite.x, sprite.y);
                    if (dist < 40) { 
                        hitEnemyId = targetTok.id;
                        break;
                    }
                }
                
                if (hitEnemyId) {
                    const targetTok = this.scene.tokens.find((t: any) => t.id === hitEnemyId);
                    if (attackerTok && targetTok) {
                        let maxRange = 999;
                        if (phase === 'shooting') {
                            const ranged = attackerTok.weapons.filter((w: any) => w.type === 'ranged');
                            maxRange = ranged.length > 0 ? Math.max(...ranged.map((w: any) => w.range)) : 0;
                        } else if (phase === 'fight') {
                            maxRange = 1;
                        }
                        
                        const distInches = Math.hypot(attackerTok.x - targetTok.x, attackerTok.y - targetTok.y);
                        
                        if (distInches <= maxRange) {
                            const attackerId = gameObject.getData('tokenId');
                            EventBus.emit('ui-queue-attack', { attackerId, targetId: hitEnemyId });
                        } else {
                            this.scene.showFloatingText(pointerPoint.x, pointerPoint.y, "¡Fuera de Rango!", 0xff0000);
                        }
                    }
                }
                
                this.scene.measurementLine.clear();
                this.scene.draggingToken = null as any;
                this.scene.dragStartWorld = null as any;
                this.scene.dragStartElevation = 0;
                return;
            }

            if (this.scene.dragStartWorld) {
                const moves = [];
                
                const targetX = gameObject.getData('targetX');
                const targetY = gameObject.getData('targetY');
                const endWorld = this.scene.getWorldPoint(targetX, targetY + (gameObject.getData('z') || 0));
                const el = PhysicsManager.getElevationInfo(endWorld.x, endWorld.y, this.scene.terrain);
                moves.push({ id: gameObject.getData('tokenId'), x: endWorld.x, y: endWorld.y, z: el.z });
                
                if (this.scene.dragGroup) {
                    for (const member of this.scene.dragGroup) {
                        const mTargetX = member.sprite.getData('targetX');
                        const mTargetY = member.sprite.getData('targetY');
                        const mEndWorld = this.scene.getWorldPoint(mTargetX, mTargetY + (member.sprite.getData('z') || 0));
                        const mel = PhysicsManager.getElevationInfo(mEndWorld.x, mEndWorld.y, this.scene.terrain);
                        moves.push({ id: member.sprite.getData('tokenId'), x: mEndWorld.x, y: mEndWorld.y, z: mel.z });
                    }
                }
                
                EventBus.emit('ui-move', moves);
            }
            this.scene.draggingToken = null as any;
            this.scene.dragGroup = null as any;
            this.scene.dragStartWorld = null as any;
            this.scene.dragStartElevation = 0;
            if (this.scene.measurementLine) this.scene.measurementLine.clear();
            if (this.scene.measurementText) this.scene.measurementText.setVisible(false);
        });
    }
}
