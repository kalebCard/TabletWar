'use client';

import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BoardScene } from '@/lib/game/BoardScene';
import { EventBus } from '@/lib/game/EventBus';

export default function PhaserGame({ 
  tokens, 
  units,
  terrain, 
  game,
  deployingUnitId,
  onSelect,
  onMoveTokens,
  onMoveTerrain,
  onDeployUnit,
  onQueueAttack,
  combatQueue,
  selectedIds
}: { 
  tokens: any, 
  units?: any[],
  terrain: any, 
  game: any,
  deployingUnitId?: string | null,
  onSelect: React.Dispatch<React.SetStateAction<string[]>>
  onMoveTokens: (moves: { id: string, x: number, y: number }[]) => void
  onMoveTerrain?: (moves: { id: string, dx: number, dy: number }[]) => void
  onDeployUnit?: (id: string, x: number, y: number) => void
  onQueueAttack?: (attackerId: string, targetId: string) => void
  combatQueue?: any[]
  selectedIds?: string[]
}) {
  const gameRef = useRef<Phaser.Game | null>(null);

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
  const stateRef = useRef({ game, deployingUnitId, onSelect, onMoveTokens, onMoveTerrain, onDeployUnit, onQueueAttack });
  
  // Update refs without re-rendering
  useEffect(() => {
    stateRef.current = { game, deployingUnitId, onSelect, onMoveTokens, onMoveTerrain, onDeployUnit, onQueueAttack };
  }, [game, deployingUnitId, onSelect, onMoveTokens, onMoveTerrain, onDeployUnit, onQueueAttack]);

  // Sync React State to Phaser Scene
  useEffect(() => {
    EventBus.emit('sync-state', { tokens, terrain, game, combatQueue, units, deployingUnitId, selectedIds });
  }, [tokens, terrain, game, combatQueue, units, deployingUnitId, selectedIds]);

  // Re-sync when scene is fully ready
  useEffect(() => {
    const handleSceneReady = () => {
      EventBus.emit('sync-state', { tokens, terrain, game, combatQueue, units, deployingUnitId, selectedIds });
    };
    EventBus.on('scene-ready', handleSceneReady);
    return () => {
      EventBus.off('scene-ready', handleSceneReady);
    };
  }, [tokens, terrain, game, combatQueue, units, deployingUnitId]);

  // Handle incoming events from Phaser
  useEffect(() => {
    const handleSelect = (selectedIds: string[]) => {
      stateRef.current.onSelect(selectedIds);
    };
    const handleToggleSelect = (tokenId: string) => {
      stateRef.current.onSelect((prev: any) => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.includes(tokenId) ? arr.filter((x: string) => x !== tokenId) : [...arr, tokenId];
      });
    };
    const handleMove = (moves: { id: string, x: number, y: number, z?: number }[]) => {
      onMoveTokens(moves);
    };
    const handleMoveTerrain = (moves: { id: string, dx: number, dy: number }[]) => {
      if (stateRef.current.onMoveTerrain) {
        stateRef.current.onMoveTerrain(moves);
      }
    };
    const handleMapClick = (worldPt: {x: number, y: number}) => {
      const { game, deployingUnitId, onDeployUnit, onSelect } = stateRef.current;
      if (game.phase === 'deployment' && deployingUnitId && onDeployUnit) {
        EventBus.emit('animate-teleport', { x: worldPt.x, y: worldPt.y });
        onDeployUnit(deployingUnitId, worldPt.x, worldPt.y);
      } else {
        onSelect([]); // clear selection if clicking empty space
      }
    };
    const handleQueueAttack = (data: { attackerId: string, targetId: string }) => {
      if (stateRef.current.onQueueAttack) {
        stateRef.current.onQueueAttack(data.attackerId, data.targetId);
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
  }, [onMoveTokens]);

  return (
    <div className="relative w-full h-full">
      <div id="phaser-container" className="w-full h-full" />
    </div>
  )
}
