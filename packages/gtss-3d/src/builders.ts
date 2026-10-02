import * as THREE from "three";
import { detectorColor } from "./detectorPlacement";
import { centerSideSign } from "./laneAssignment";
import { CROSSWALK_OFFSET, CROSSWALK_WIDTH, type IntersectionLayout, type LegPlan } from "./layout";
import { legPoint, type Leg } from "./legLayout";
import { coreOutline, cornerPadOutline, slipGeometry } from "./sceneGeometry";
import {
  createAsphaltTexture,
  createCrosswalkTexture,
  createHatchTexture,
  createLabelTexture,
  createLegTexture,
  createSlipTexture,
} from "./textures";
import type { Vec2 } from "./types";

export interface BuildOptions {
  showDetectors?: boolean;
  showLabels?: boolean;
  showSignals?: boolean;
  anisotropy?: number;
}

const DEG = Math.PI / 180;
const CURB_HEIGHT = 0.15;
const Y_CORE = 0.01;
const Y_SLIP = 0.025;
const Y_ROAD = 0.04;
const Y_DECAL = 0.055;
const Y_DETECTOR = 0.07;

function standard(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra });
}

function createPalette() {
  return {
    concrete: standard("#cfcfca"),
    curb: standard("#b9b9b4"),
    grass: standard("#6f9a4c"),
    barrier: standard("#bdbdb6"),
    fence: standard("#4b5563", { metalness: 0.4, roughness: 0.6 }),
    flexPost: standard("#facc15", { roughness: 0.5 }),
    pole: standard("#5b6166", { metalness: 0.5, roughness: 0.5 }),
    housing: standard("#1f2326", { roughness: 0.6 }),
    backplate: standard("#0f1113", { roughness: 0.8 }),
    lensRed: standard("#ff2a1a", { emissive: "#ff2a1a", emissiveIntensity: 2.2 }),
    lensYellow: standard("#3a3000"),
    lensGreen: standard("#003a14"),
  };
}
type Palette = ReturnType<typeof createPalette>;

const toShape = (points: Vec2[]) =>
  new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.z)));

function flatMesh(points: Vec2[], y: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.ShapeGeometry(toShape(points));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function raisedMesh(points: Vec2[], height: number, material: THREE.Material | THREE.Material[]) {
  const geometry = new THREE.ExtrudeGeometry(toShape(points), {
    depth: height,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Group whose local frame is the leg's: x = -t (lateral), z = s (distance from centre). */
function legFrame(leg: Leg): THREE.Group {
  const group = new THREE.Group();
  group.rotation.y = Math.PI - leg.angle * DEG;
  return group;
}

function legBox(
  t0: number,
  t1: number,
  s0: number,
  s1: number,
  y0: number,
  height: number,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(t1 - t0, height, s1 - s0), material);
  mesh.position.set(-(t0 + t1) / 2, y0 + height / 2, (s0 + s1) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildLeg(plan: LegPlan, palette: Palette, anisotropy: number): THREE.Group {
  const { leg } = plan;
  const frame = legFrame(leg);
  const end = leg.mouth + leg.length;
  const roadWidth = leg.roadT1 - leg.roadT0;

  const roadGeometry = new THREE.PlaneGeometry(roadWidth, leg.length);
  roadGeometry.rotateX(-Math.PI / 2);
  const road = new THREE.Mesh(
    roadGeometry,
    new THREE.MeshStandardMaterial({ map: createLegTexture(plan, anisotropy), roughness: 0.95 }),
  );
  road.position.set(-(leg.roadT0 + leg.roadT1) / 2, Y_ROAD, leg.mouth + leg.length / 2);
  road.receiveShadow = true;
  frame.add(road);

  const noseS = plan.hasCrosswalk
    ? leg.mouth + CROSSWALK_OFFSET + CROSSWALK_WIDTH + 0.4
    : leg.mouth + 1;
  leg.bands.forEach((band) => {
    const width = band.t1 - band.t0;
    const code = band.parts[0];
    const mid = (band.t0 + band.t1) / 2;
    const outside = mid < leg.roadT0 || mid > leg.roadT1;
    const sidewalkStart =
      mid < leg.roadT0
        ? plan.sidewalkStartNeg
        : mid > leg.roadT1
          ? plan.sidewalkStartPos
          : leg.mouth;
    if (width <= 0.01) return;
    if (code === "S" || (outside && code === "-")) {
      frame.add(
        legBox(
          band.t0,
          band.t1,
          sidewalkStart,
          end,
          0,
          CURB_HEIGHT,
          code === "S" ? palette.concrete : palette.curb,
        ),
      );
      return;
    }
    if (band.kind !== "divider") return;
    switch (band.raw) {
      case "-":
        frame.add(legBox(band.t0, band.t1, noseS, end, 0, CURB_HEIGHT, palette.curb));
        break;
      case "=": {
        const top = width >= 1.5 ? palette.grass : palette.concrete;
        const materials = [
          palette.curb,
          palette.curb,
          top,
          palette.curb,
          palette.curb,
          palette.curb,
        ];
        frame.add(legBox(band.t0, band.t1, noseS, end, 0, CURB_HEIGHT, materials));
        break;
      }
      case "/":
        frame.add(legBox(band.t0, band.t1, noseS, end, 0, 0.05, palette.grass));
        break;
      case "^": {
        const w = Math.min(width, 0.6);
        frame.add(legBox(mid - w / 2, mid + w / 2, plan.stopS + 2, end, 0, 0.81, palette.barrier));
        break;
      }
      case "#": {
        const start = plan.stopS + 2;
        const posts = Math.max(1, Math.floor((end - start) / 2.5));
        const post = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.08, 1.1, 0.08),
          palette.fence,
          posts,
        );
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < posts; i++) {
          post.setMatrixAt(i, matrix.makeTranslation(-mid, 0.55, start + i * 2.5));
        }
        post.castShadow = true;
        frame.add(post);
        for (const y of [0.5, 1.0]) {
          frame.add(
            legBox(
              mid - 0.03,
              mid + 0.03,
              start,
              start + (posts - 1) * 2.5,
              y,
              0.05,
              palette.fence,
            ),
          );
        }
        break;
      }
      case "!": {
        const start = plan.stopS + 2;
        const count = Math.max(1, Math.floor((end - start) / 3));
        const flex = new THREE.InstancedMesh(
          new THREE.CylinderGeometry(0.05, 0.06, 0.9, 10),
          palette.flexPost,
          count,
        );
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
          flex.setMatrixAt(i, matrix.makeTranslation(-mid, 0.45, start + i * 3));
        }
        flex.castShadow = true;
        frame.add(flex);
        break;
      }
    }
  });
  return frame;
}

function buildSignal(
  plan: LegPlan,
  layout: IntersectionLayout,
  palette: Palette,
): THREE.Group | null {
  const { leg } = plan;
  if (!plan.incoming.length) return null;
  const frame = legFrame(leg);
  const sign = centerSideSign(leg, layout.isLht);
  const curbT = sign > 0 ? leg.roadT0 - 0.6 : leg.roadT1 + 0.6;
  // At the mouth; with a slip lane this lands on the channelizing island.
  const s = leg.mouth + 0.8;
  const centreLane = plan.incoming[0];
  const farT = sign > 0 ? centreLane.t1 : centreLane.t0;
  const armLength = Math.abs(farT - curbT) + 0.4;
  const armHeight = 6.2;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.18, armHeight + 0.4, 12),
    palette.pole,
  );
  pole.position.set(-curbT, (armHeight + 0.4) / 2, s);
  pole.castShadow = true;
  frame.add(pole);

  const arm = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.14, 0.14), palette.pole);
  const armMidT = curbT + (sign > 0 ? armLength / 2 : -armLength / 2);
  arm.position.set(-armMidT, armHeight, s);
  arm.castShadow = true;
  frame.add(arm);

  const lensGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
  lensGeometry.rotateX(Math.PI / 2);
  const farTurn = layout.isLht ? "R" : "L";
  plan.incoming.forEach((band) => {
    const arrow = plan.arrows.get(band.index) ?? "T";
    const sections = arrow === farTurn ? 4 : 3;
    const height = sections * 0.3 + 0.1;
    const head = new THREE.Group();
    head.position.set(-(band.t0 + band.t1) / 2, armHeight - 0.1 - height / 2, s);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.36, height, 0.28), palette.housing);
    housing.castShadow = true;
    head.add(housing);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, height + 0.24, 0.03),
      palette.backplate,
    );
    plate.position.z = -0.16;
    head.add(plate);
    const lenses =
      sections === 4
        ? [palette.lensRed, palette.lensYellow, palette.lensYellow, palette.lensGreen]
        : [palette.lensRed, palette.lensYellow, palette.lensGreen];
    lenses.forEach((material, i) => {
      const lens = new THREE.Mesh(lensGeometry, material);
      lens.position.set(0, height / 2 - 0.2 - i * 0.3, 0.15);
      head.add(lens);
    });
    frame.add(head);
  });
  return frame;
}

function buildDetectors(layout: IntersectionLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = "detectors";
  layout.detectors.forEach((zone) => {
    const leg = layout.legs[zone.legIndex];
    const frame = legFrame(leg);
    const isLoop = zone.detector.technologyType.toLowerCase().includes("loop");
    const fill = new THREE.MeshBasicMaterial({
      color: zone.color,
      transparent: true,
      opacity: isLoop ? 0.18 : 0.35,
      depthWrite: false,
    });
    const edge = new THREE.LineBasicMaterial({
      color: detectorColor(zone.detector.technologyType),
    });
    zone.bands.forEach((band) => {
      const t0 = band.t0 + 0.35;
      const t1 = band.t1 - 0.35;
      const geometry = new THREE.PlaneGeometry(t1 - t0, zone.s1 - zone.s0);
      geometry.rotateX(-Math.PI / 2);
      const plane = new THREE.Mesh(geometry, fill);
      plane.position.set(-(t0 + t1) / 2, Y_DETECTOR, (zone.s0 + zone.s1) / 2);
      frame.add(plane);
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-t0, Y_DETECTOR + 0.005, zone.s0),
          new THREE.Vector3(-t1, Y_DETECTOR + 0.005, zone.s0),
          new THREE.Vector3(-t1, Y_DETECTOR + 0.005, zone.s1),
          new THREE.Vector3(-t0, Y_DETECTOR + 0.005, zone.s1),
        ]),
        edge,
      );
      frame.add(outline);
    });
    group.add(frame);
  });
  return group;
}

function crosswalkDecal(center: Vec2, angleDeg: number, length: number, anisotropy: number) {
  const geometry = new THREE.PlaneGeometry(CROSSWALK_WIDTH, length);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    map: createCrosswalkTexture(CROSSWALK_WIDTH, length, anisotropy),
    transparent: true,
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center.x, Y_DECAL, center.z);
  mesh.rotation.y = -angleDeg * DEG;
  mesh.receiveShadow = true;
  return mesh;
}

function ribbonGeometry(
  left: Vec2[],
  right: Vec2[],
  y: number,
): { geometry: THREE.BufferGeometry; length: number } {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const along = [0];
  for (let i = 1; i < left.length; i++) {
    const mid = (p: Vec2[], j: number) => ({
      x: (p[j].x + right[j].x) / 2,
      z: (p[j].z + right[j].z) / 2,
    });
    const a = mid(left, i - 1);
    const b = mid(left, i);
    along.push(along[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = along[along.length - 1] || 1;
  left.forEach((l, i) => {
    const r = right[i];
    positions.push(l.x, y, l.z, r.x, y, r.z);
    const v = along[i] / length;
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, length };
}

function buildSlips(layout: IntersectionLayout, palette: Palette, anisotropy: number): THREE.Group {
  const group = new THREE.Group();
  layout.slips.forEach((slip) => {
    const geo = slipGeometry(layout, slip);
    if (!geo) return;
    // Turning toward the near side puts the inner edge on the driver's right in RHT, left in LHT.
    const [left, right] = layout.isLht ? [geo.inner, geo.outer] : [geo.outer, geo.inner];
    // Below the leg surfaces so it only shows where it leaves the roadway.
    const { geometry, length } = ribbonGeometry(left, right, Y_SLIP);
    const ribbon = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: createSlipTexture(slip.width, length, slip.mode >= 2, anisotropy),
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    ribbon.receiveShadow = true;
    group.add(ribbon);
    if (geo.island) {
      if (slip.mode === 1) {
        group.add(
          flatMesh(
            geo.island,
            Y_DECAL,
            new THREE.MeshStandardMaterial({
              map: createHatchTexture(anisotropy),
              roughness: 0.95,
            }),
          ),
        );
      } else {
        const top = slip.mode === 3 ? palette.grass : palette.concrete;
        group.add(raisedMesh(geo.island, CURB_HEIGHT, [top, palette.curb]));
      }
    }
  });
  return group;
}

function buildLabels(layout: IntersectionLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = "labels";
  layout.legs.forEach((leg) => {
    const text = leg.approach.streetName || leg.approach.approachId;
    if (!text) return;
    const { texture, aspect } = createLabelTexture(text);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    const height = 2.6;
    sprite.scale.set(height * aspect, height, 1);
    const at = legPoint(
      leg,
      (leg.roadT0 + leg.roadT1) / 2,
      leg.mouth + Math.min(leg.length - 8, 45),
    );
    sprite.position.set(at.x, 4.5, at.z);
    sprite.renderOrder = 10;
    group.add(sprite);
  });
  return group;
}

/** Builds every mesh for an intersection layout into a single group (world units: metres). */
export function buildIntersectionObject(
  layout: IntersectionLayout,
  options: BuildOptions = {},
): THREE.Group {
  const anisotropy = options.anisotropy ?? 1;
  const palette = createPalette();
  const root = new THREE.Group();
  root.name = "gtss-intersection";

  if (layout.legs.length >= 2) {
    const core = coreOutline(layout);
    if (core.length >= 3) {
      root.add(
        flatMesh(
          core,
          Y_CORE,
          new THREE.MeshStandardMaterial({
            map: createAsphaltTexture(anisotropy),
            roughness: 0.95,
          }),
        ),
      );
    }
    layout.corners.forEach((corner) => {
      const pad = cornerPadOutline(layout, corner);
      if (pad && pad.length >= 3)
        root.add(raisedMesh(pad, CURB_HEIGHT, [palette.concrete, palette.curb]));
    });
  }

  layout.plans.forEach((plan) => root.add(buildLeg(plan, palette, anisotropy)));
  root.add(buildSlips(layout, palette, anisotropy));

  const minMouth = Math.min(...layout.legs.map((leg) => leg.mouth));
  layout.crosswalks.diagonals.forEach((angle) => {
    root.add(crosswalkDecal({ x: 0, z: 0 }, angle, Math.max(6, minMouth * 2), anisotropy));
  });
  const widest = Math.max(...layout.legs.map((leg) => leg.roadT1 - leg.roadT0));
  layout.crosswalks.core.forEach((angle) => {
    root.add(crosswalkDecal({ x: 0, z: 0 }, angle, widest, anisotropy));
  });

  if (options.showSignals ?? true) {
    layout.plans.forEach((plan) => {
      const signal = buildSignal(plan, layout, palette);
      if (signal) root.add(signal);
    });
  }
  if (options.showDetectors ?? true) root.add(buildDetectors(layout));
  if (options.showLabels ?? true) root.add(buildLabels(layout));
  return root;
}

/** Disposes geometries, materials and textures under an object. */
export function disposeObject(object: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => materials.add(m));
    else if (material) materials.add(material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    const map = (material as THREE.MeshStandardMaterial).map;
    map?.dispose();
    material.dispose();
  });
}
