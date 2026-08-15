import Phaser from 'phaser';
import { DATASHEETS } from '../../constants';
import { Token } from '../../types';

export class TokenRenderer {
    private scene: Phaser.Scene;
    private tokenSprites: Phaser.GameObjects.Group;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.tokenSprites = this.scene.add.group();
    }

    public renderTokens() {
        const board = this.scene as any;
        const tokenSprites = board.tokenSprites;
        if (!tokenSprites || !tokenSprites.children) return;
        
        const currentIds = board.tokens.map((t: any) => t.id);
        
        // Remove sprites that no longer exist with a sleek Death Animation
        const sprites = tokenSprites.getChildren() as Phaser.GameObjects.Sprite[];
        sprites.forEach((sprite) => {
            const tokenId = sprite.getData('tokenId');
            if (!currentIds.includes(tokenId) && !sprite.getData('dying')) {
                sprite.setData('dying', true);
                
                tokenSprites.remove(sprite);

                const deathEffect = this.scene.add.graphics();
                deathEffect.setDepth(sprite.depth + 10);
                
                let radius = 5;
                const fxTimer = this.scene.time.addEvent({
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

                sprite.setTint(0xff3333);
                this.scene.tweens.add({
                    targets: sprite,
                    angle: 90,             
                    alpha: 0,              
                    scaleX: sprite.scaleX * 0.4,
                    scaleY: sprite.scaleY * 0.4,
                    y: sprite.y + 12,      
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
        board.tokens.forEach((tok: any) => {
            let sprite = (tokenSprites.getChildren() as Phaser.GameObjects.Sprite[])
                .find(s => s.getData('tokenId') === tok.id);
                
            if (!sprite) {
                const dsId = DATASHEETS.find(ds => ds.image && ds.image === tok.image)?.id;
                const miniKey = dsId ? `mini_${dsId}` : null;
                const fallbackKey = tok.faction === 'imperium' ? 'token_imperium' : 'token_chaos';
                const imgKey = (miniKey && this.scene.textures.exists(miniKey)) ? miniKey : fallbackKey;
                sprite = this.scene.add.sprite(0, 0, imgKey);
                
                const targetWidth = (tok.baseMm / 25.4) * 64;
                const scale = targetWidth / sprite.width;
                sprite.setScale(scale);
                sprite.setData('baseScale', scale); 
                
                sprite.setOrigin(0.5, 0.85);
                sprite.setInteractive({ cursor: 'pointer' });
                this.scene.input.setDraggable(sprite);
                
                sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
                    const EventBus = require('../../EventBus').EventBus;
                    if (pointer.event?.shiftKey || board.isMultiSelectMode) {
                        EventBus.emit('ui-toggle-select', tok.id);
                    } else {
                        EventBus.emit('ui-select', [tok.id]);
                    }
                });
                
                tokenSprites.add(sprite);
            }
            
            sprite.setData('tokenId', tok.id);
            sprite.setData('worldX', tok.x);
            sprite.setData('worldY', tok.y);
            
            const el = board.getElevationInfo(tok.x, tok.y);
            sprite.setData('z', tok.z ?? el.z);
            sprite.setData('terrainId', el.terrainId);
        });
        
        board.updateBoardRender();
    }

    public createTransparentTexture(sourceKey: string, newKey: string) {
        const srcTexture = this.scene.textures.get(sourceKey);
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
            const maxChannel = Math.max(r, g, b);
            const minChannel = Math.min(r, g, b);
            const saturation = maxChannel - minChannel; 
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
        if (this.scene.textures.exists(newKey)) {
            this.scene.textures.remove(newKey);
        }
        this.scene.textures.addCanvas(newKey, canvas);
    }
}
