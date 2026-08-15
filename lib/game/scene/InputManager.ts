import Phaser from 'phaser';
import type { BoardScene } from '../BoardScene';

export class InputManager {
    private scene: BoardScene;

    public keyQ?: Phaser.Input.Keyboard.Key;
    public keyE?: Phaser.Input.Keyboard.Key;
    public keyW?: Phaser.Input.Keyboard.Key;
    public keyA?: Phaser.Input.Keyboard.Key;
    public keyS?: Phaser.Input.Keyboard.Key;
    public keyD?: Phaser.Input.Keyboard.Key;

    constructor(scene: BoardScene) {
        this.scene = scene;
    }

    public setupInput() {
        this.setupKeyboard();
        this.setupWheel();
    }

    private setupKeyboard() {
        if (this.scene.input.keyboard) {
            this.keyQ = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
            this.keyE = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            this.keyW = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
            this.keyA = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
            this.keyS = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
            this.keyD = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        }
    }

    private setupWheel() {
        this.scene.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[], deltaX: number, deltaY: number) => {
            const newZoom = this.scene.cameras.main.zoom - deltaY * 0.001;
            this.scene.cameras.main.setZoom(Phaser.Math.Clamp(newZoom, 0.3, 3));
        });
    }

    // TODO: Phase 4.2 - Migrate complex drag handlers and pointerdown events from BoardScene here.
}
