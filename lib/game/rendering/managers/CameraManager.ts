import Phaser from 'phaser';
import { EventBus } from '../../EventBus';

export class CameraManager {
    private scene: Phaser.Scene;
    public cameraYaw = 0;
    public targetScrollX = 0;
    public targetScrollY = 0;
    public targetZoom = 1.0;
    public targetYaw = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.setupEventListeners();
    }

    private setupEventListeners() {
        EventBus.on('camera-zoom-in', () => {
            this.scene.cameras.main.setZoom(Phaser.Math.Clamp(this.scene.cameras.main.zoom + 0.25, 0.3, 3));
            this.targetZoom = this.scene.cameras.main.zoom;
        });

        EventBus.on('camera-zoom-out', () => {
            this.scene.cameras.main.setZoom(Phaser.Math.Clamp(this.scene.cameras.main.zoom - 0.25, 0.3, 3));
            this.targetZoom = this.scene.cameras.main.zoom;
        });

        EventBus.on('camera-reset', () => {
            this.scene.cameras.main.setZoom(1.0);
            this.scene.cameras.main.scrollX = 0;
            this.scene.cameras.main.scrollY = 0;
            this.scene.cameras.main.setRotation(0);
            this.cameraYaw = 0;
            this.targetZoom = 1.0;
            this.targetScrollX = 0;
            this.targetScrollY = 0;
            this.targetYaw = 0;
            if ('updateBoardRender' in this.scene) {
                (this.scene as any).updateBoardRender();
            }
        });

        EventBus.on('camera-rotate-left', () => {
            this.rotateCamera(-Math.PI / 8);
        });

        EventBus.on('camera-rotate-right', () => {
            this.rotateCamera(Math.PI / 8);
        });
    }

    public rotateCamera(delta: number) {
        this.targetYaw += delta;
    }

    public update(time: number, delta: number) {
        // Smooth camera interpolation
        const cam = this.scene.cameras.main;
        
        if (Math.abs(this.targetYaw - this.cameraYaw) > 0.001) {
            this.cameraYaw += (this.targetYaw - this.cameraYaw) * 0.1;
        }

        if (Math.abs(this.targetZoom - cam.zoom) > 0.001) {
            cam.setZoom(cam.zoom + (this.targetZoom - cam.zoom) * 0.1);
        }

        if (Math.abs(this.targetScrollX - cam.scrollX) > 0.1) {
            cam.scrollX += (this.targetScrollX - cam.scrollX) * 0.1;
        }

        if (Math.abs(this.targetScrollY - cam.scrollY) > 0.1) {
            cam.scrollY += (this.targetScrollY - cam.scrollY) * 0.1;
        }
    }
}
