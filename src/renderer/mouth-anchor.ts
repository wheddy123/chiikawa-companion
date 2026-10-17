export interface MouthAnchorData {
  pLocal: [number, number, number];
  qLocal: [number, number, number, number];
  pointWorld: [number, number, number];
  normalWorld: [number, number, number];
  uv: [number, number];
  screenPx: [number, number];
}

/**
 * Single source of truth for Chiikawa's mouth position.
 * Derived by computer-vision feature clustering on clean rendered snapshot
 * and projected to 3D surface via Three.js Raycaster.
 */
export const MOUTH_ANCHOR: MouthAnchorData = {
  pLocal: [0.012027, 0.038459, 1.325704],
  qLocal: [0.134294, 0.061106, -0.038995, 0.988287],
  pointWorld: [0.005158, -0.410013, 0.603186],
  normalWorld: [0.110306, -0.251025, 0.961675],
  uv: [0.704842, 0.814917],
  screenPx: [160.55, 334.65],
};
