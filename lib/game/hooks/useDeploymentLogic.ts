import { useGameStore } from "../../store/gameStore";
import { useUIStore } from "../../store/uiStore";
import { isValidDeploymentPosition } from "../rules";
import { Token, Unit } from "../types";

export function useDeploymentLogic(engine: any) {
  const uiStore = useUIStore();

  const handleSelectUnitToDeploy = (unitId: string) => {
    const isDeploying = uiStore.deployingUnitId === unitId;
    if (isDeploying) {
      uiStore.setDeployingUnitId(null);
    } else {
      uiStore.setDeployingUnitId(unitId);
      uiStore.setUIState({ isMobileOpen: false }); // Auto-minimize panel so user can see full 3D board
    }
  };

  const handleDeployUnit = (id: string, x: number, y: number) => {
    const state = useGameStore.getState();
    const roster = engine?.rosterUnits ?? state.rosterUnits;
    const rUnit = roster?.find((u: any) => u.id === id);
    const faction = rUnit?.faction || "imperium";
    const terrainLayout = engine?.game?.terrainLayout ?? state.game?.terrainLayout ?? "custom";

    const deploymentCheck = isValidDeploymentPosition(faction, x, terrainLayout);
    if (!deploymentCheck.valid) {
      alert(deploymentCheck.errorMessage);
      return;
    }

    if (engine?.deployUnit) {
      engine.deployUnit(id, x, y);
    }
    uiStore.setUIState({ isMobileOpen: true }); // Auto-reopen panel after unit placement
  };

  return { handleSelectUnitToDeploy, handleDeployUnit };
}
