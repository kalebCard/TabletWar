'use client';

import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BoardScene } from '@/lib/game/BoardScene';
import { EventBus } from '@/lib/game/EventBus';
import { useGameStore } from '@/lib/store/gameStore';
import { useUIStore } from '@/lib/store/uiStore';

export interface PhaserGameProps {
  onSelect: React.Dispatch<React.SetStateAction<string[]>>
  onMoveTokens: (moves: { id: string, x: number, y: number }[]) => void
  onMoveTerrain?: (moves: { id: string, dx: number, dy: number }[]) => void
  onDeployUnit?: (id: string, x: number, y: number) => void
  onQueueAttack?: (attackerId: string, targetId: string) => void
}

export default function PhaserGame({
  onSelect,
  onMoveTokens,
  onMoveTerrain,
  onDeployUnit,
  onQueueAttack,
}: PhaserGameProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  
  // Connect directly to the store for state sync instead of relying on React props
  const tokens = useGameStore(state => state.tokens);
  const units = useGameStore(state => state.units);
  const terrain = useGameStore(state => state.terrainState);
  const game = useGameStore(state => state.game);
  const deployingUnitId = useUIStore(state => state.deployingUnitId);
  const combatQueue = useUIStore(state => state.combatQueue);
  const selectedIds = useUIStore(state => state.selectedIds);

  useEffect(() => {
    // Safely wrap releasePointerCapture to prevent devtools multi-touch errors
    if (typeof window !== 'undefined' && !(window as any).__pointerCapturePatched) {
      (window as any).__pointerCapturePatched = true;
      const originalRelease = Element.prototype.releasePointerCapture;
      Element.prototype.releasePointerCapture = function (pointerId: number) {
        try {
          if (this.hasPointerCapture && this.hasPointerCapture(pointerId)) {
            originalRelease.call(this, pointerId);
          }
        } catch {
          // Ignore stale pointer release on multi-touch gestures
        }
      };
    }

    // Initialize Phaser only once on client side
    if (typeof window !== 'undefined' && !gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: 'phaser-container',
        width: '100%',
        height: '100%',
        scene: [BoardScene],
        backgroundColor: '#090b0e',
        pixelArt: false,
        input: {
          activePointers: 3,
        },
        audio: {
          noAudio: true
        },
        render: {
          clearBeforeRender: true,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
          transparent: false
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH
        }
      };

      gameRef.current = new Phaser.Game(config);
    }

    return () => {
      // Cleanup
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  // Use a ref to access latest props in event listeners
  const callbacksRef = useRef({ onSelect, onMoveTokens, onMoveTerrain, onDeployUnit, onQueueAttack });
  const stateRef = useRef({ game, deployingUnitId });
  
  // Update refs without re-rendering
  useEffect(() => {
    callbacksRef.current = { onSelect, onMoveTokens, onMoveTerrain, onDeployUnit, onQueueAttack };
  }, [onSelect, onMoveTokens, onMoveTerrain, onDeployUnit, onQueueAttack]);

  useEffect(() => {
    stateRef.current = { game, deployingUnitId };
  }, [game, deployingUnitId]);

  // Handle incoming events from Phaser
  useEffect(() => {
    const handleSelect = (selectedIds: string[]) => {
      callbacksRef.current.onSelect(selectedIds);
    };
    const handleToggleSelect = (tokenId: string) => {
      callbacksRef.current.onSelect((prev: any) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.includes(tokenId) ? arr.filter((x: string) => x !== tokenId) : [...arr, tokenId];
      });
    };
    const handleMove = (moves: { id: string, x: number, y: number, z?: number }[]) => {
      callbacksRef.current.onMoveTokens(moves);
    };
    const handleMoveTerrain = (moves: { id: string, dx: number, dy: number }[]) => {
      if (callbacksRef.current.onMoveTerrain) {
        callbacksRef.current.onMoveTerrain(moves);
      }
    };
    const handleMapClick = (worldPt: {x: number, y: number}) => {
      const { onDeployUnit, onSelect } = callbacksRef.current;
      const { game, deployingUnitId } = stateRef.current;
      if (game.phase === 'deployment' && deployingUnitId && onDeployUnit) {
        EventBus.emit('animate-teleport', { x: worldPt.x, y: worldPt.y });
        onDeployUnit(deployingUnitId, worldPt.x, worldPt.y);
      } else {
        onSelect([]); // clear selection if clicking empty space
      }
    };
    const handleQueueAttack = (data: { attackerId: string, targetId: string }) => {
      if (callbacksRef.current.onQueueAttack) {
        callbacksRef.current.onQueueAttack(data.attackerId, data.targetId);
      }
    };
    
    EventBus.on('ui-select', handleSelect);
    EventBus.on('ui-toggle-select', handleToggleSelect);
    EventBus.on('ui-move', handleMove);
    EventBus.on('ui-move-terrain', handleMoveTerrain);
    EventBus.on('ui-map-click', handleMapClick);
    EventBus.on('ui-queue-attack', handleQueueAttack);
    
    return () => {
      EventBus.off('ui-select', handleSelect);
      EventBus.off('ui-toggle-select', handleToggleSelect);
      EventBus.off('ui-move', handleMove);
      EventBus.off('ui-move-terrain', handleMoveTerrain);
      EventBus.off('ui-map-click', handleMapClick);
      EventBus.off('ui-queue-attack', handleQueueAttack);
    }
  }, []);

  return (
    <div className="relative w-full h-full">
      <div id="phaser-container" className="w-full h-full" />
    </div>
  )
}
