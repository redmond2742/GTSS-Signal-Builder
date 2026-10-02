import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildIntersectionObject, disposeObject, type BuildOptions } from "./builders";
import { computeLayout, type IntersectionLayout } from "./layout";
import type { IntersectionInput, LayoutOptions } from "./types";

export interface IntersectionSceneOptions extends LayoutOptions, Omit<BuildOptions, "anisotropy"> {
  background?: string;
}

export interface IntersectionSceneHandle {
  /** Rebuilds the intersection; the camera is re-framed only when `reframe` is true. */
  update(input: IntersectionInput, options?: IntersectionSceneOptions, reframe?: boolean): void;
  /** Renders a frame and returns it as a data URL. */
  snapshot(type?: "image/jpeg" | "image/png", quality?: number): string;
  getLayout(): IntersectionLayout;
  dispose(): void;
}

const DEFAULT_BACKGROUND = "#dfe8ef";

/** Mounts a WebGL view of the intersection into `container`. Throws if WebGL is unavailable. */
export function createIntersectionScene(
  container: HTMLElement,
  input: IntersectionInput,
  options: IntersectionSceneOptions = {},
): IntersectionSceneHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 4;

  const hemi = new THREE.HemisphereLight("#ffffff", "#6b7f5a", 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff6e5", 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#8aa56d", roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  let content: THREE.Group | null = null;
  let layout = computeLayout(input, options);

  const frame = () => {
    const radius = Math.max(30, ...layout.legs.map((leg) => leg.mouth + Math.min(leg.length, 45)));
    camera.position.set(radius * 0.55, radius * 1.05, radius * 1.15);
    camera.near = 0.5;
    camera.far = radius * 20;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.maxDistance = radius * 4;
    controls.update();
  };

  const build = (next: IntersectionInput, nextOptions: IntersectionSceneOptions) => {
    layout = computeLayout(next, nextOptions);
    if (content) {
      scene.remove(content);
      disposeObject(content);
    }
    content = buildIntersectionObject(layout, {
      ...nextOptions,
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    scene.add(content);

    const reach = Math.max(60, layout.reach);
    const background = new THREE.Color(nextOptions.background ?? DEFAULT_BACKGROUND);
    scene.background = background;
    scene.fog = new THREE.Fog(background, reach * 2.5, reach * 7);
    ground.scale.set(reach * 12, reach * 12, 1);
    sun.position.set(reach * 0.6, reach * 1.2, reach * 0.35);
    const shadowCamera = sun.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -reach;
    shadowCamera.right = shadowCamera.top = reach;
    shadowCamera.far = reach * 4;
    shadowCamera.updateProjectionMatrix();
  };

  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  build(input, options);
  frame();
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    update(nextInput, nextOptions = options, reframe = false) {
      options = nextOptions;
      build(nextInput, nextOptions);
      if (reframe) frame();
    },
    snapshot(type = "image/jpeg", quality = 0.92) {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL(type, quality);
    },
    getLayout: () => layout,
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      if (content) disposeObject(content);
      ground.geometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
