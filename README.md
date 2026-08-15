# Warhammer 40k Web Simulator

Una simulación interactiva de batallas de mesa ambientada en el universo de Warhammer 40,000, construida con React, Phaser 3 y Next.js.

## Características

- **Tablero Isométrico 3D**: Entorno renderizado con Phaser 3 que permite mover miniaturas sobre terreno tridimensional en perspectiva isométrica.
- **Flujo Completo de Juego**: Soporta las fases de Warhammer 40k (Despliegue, Mando, Movimiento, Disparo, Carga, Combate).
- **Dados Físicos en 3D**: Lanzamientos de dados simulados con físicas realistas superpuestos sobre la interfaz mediante React.
- **Resolución de Combate Batch**: Agrupa y resuelve rápidamente múltiples ataques, tiradas de impacto, heridas y salvaciones con una interfaz limpia.
- **Animaciones Integradas**: Los ataques desencadenan espectaculares animaciones en el tablero (láseres, explosiones y teleportaciones).
- **Armado de Listas (Roster)**: Crea listas de ejércitos (Marines Espaciales, Tiránidos, Necrones, Caos, Orkos y T'au) estableciendo un límite de puntos.

## Tecnologías Utilizadas

- **Frontend**: Next.js (App Router), React, TailwindCSS, shadcn/ui.
- **Motor Gráfico**: Phaser 3 (Manejo del mapa y sprites isométricos).
- **Físicas / Animaciones**: Físicas customizadas, animaciones 3D.
- **Gestión de Estado**: Zustand (`useGameStore`, `useUIStore`) para una comunicación fluida y reactiva entre la UI (React) y el Canvas (Phaser).

## Arquitectura de Software

El proyecto sigue una arquitectura altamente modular centrada en principios **SOLID**:
- **Desacoplamiento del Motor y UI**: React renderiza la interfaz y paneles lógicos (como los cálculos de combate aislados en hooks propios) mientras Phaser se dedica al renderizado. Ambos se comunican mediante Eventos y el estado global de Zustand.
- **Managers Específicos**: El 'God Object' `BoardScene` fue refactorizado dividiendo responsabilidades en clases concretas (`TerrainRenderer`, `TokenRenderer`, `CameraManager`, `InteractionManager` y `PhysicsManager`).
- **Lógica de Combate**: El panel de combate separa limpiamente la capa visual de React de la compleja lógica de negocio de Warhammer 40k usando el hook `useCombatCalculations`.

## Requisitos

- Node.js 18+
- npm, yarn o pnpm

## Instalación y Ejecución

1. Clona el repositorio:
   ```bash
   git clone <tu-repositorio>
   cd wh4k
   ```

2. Instala las dependencias:
   ```bash
   npm install
   # o pnpm install
   ```

3. Levanta el entorno de desarrollo:
   ```bash
   npm run dev
   # o pnpm dev
   ```

4. Abre `http://localhost:3000` en tu navegador.

## Despliegue

Este proyecto está optimizado para su despliegue en Vercel. 
Solo debes enlazar tu repositorio de GitHub con un nuevo proyecto en Vercel y hacer un push a la rama principal.

## Agradecimientos
Proyecto inspirado en el legendario wargame de mesa Warhammer 40,000 de Games Workshop.
