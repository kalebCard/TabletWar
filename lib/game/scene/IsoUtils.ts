/**
 * Pure 3D Isometric Projection Helper Functions
 */

export interface IsoConfig {
  gridWidth: number;
  gridHeight: number;
  tileWidth: number;
  tileHeight: number;
  cameraYaw: number;
  cameraWidth: number;
}

export function getIsoPoint(tx: number, ty: number, cfg: IsoConfig): { x: number; y: number } {
  const cx = cfg.gridWidth / 2;
  const cy = cfg.gridHeight / 2;

  // Translate to origin
  const dx = tx - cx;
  const dy = ty - cy;

  const rad = cfg.cameraYaw;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Rotate around grid center
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  // Translate back
  const ftx = rx + cx;
  const fty = ry + cy;

  const sx = (ftx - fty) * cfg.tileWidth;
  const sy = (ftx + fty) * cfg.tileHeight;

  return { x: sx, y: sy };
}

export function getWorldPoint(sx: number, sy: number, cfg: IsoConfig): { x: number; y: number } {
  // Adjust for grid offset
  sx -= cfg.cameraWidth / 2;
  sy -= 200;

  // Inverse isometric projection
  const ftx = (sx / cfg.tileWidth + sy / cfg.tileHeight) / 2;
  const fty = (sy / cfg.tileHeight - sx / cfg.tileWidth) / 2;

  const cx = cfg.gridWidth / 2;
  const cy = cfg.gridHeight / 2;

  // Translate to origin
  const rx = ftx - cx;
  const ry = fty - cy;

  const rad = -cfg.cameraYaw;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Inverse rotation
  const dx = rx * cos - ry * sin;
  const dy = rx * sin + ry * cos;

  return { x: dx + cx, y: dy + cy };
}
