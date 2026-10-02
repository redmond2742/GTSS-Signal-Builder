import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  createIntersectionScene,
  type IntersectionSceneHandle,
  type IntersectionSceneOptions,
} from "../scene";
import type { IntersectionInput } from "../types";

export interface Intersection3DProps extends IntersectionSceneOptions {
  input: IntersectionInput;
  className?: string;
  style?: CSSProperties;
}

export interface Intersection3DHandle {
  /** Current view as a data URL, or null before the scene is ready. */
  toDataUrl(type?: "image/jpeg" | "image/png", quality?: number): string | null;
}

/** Orbitable three.js view of an intersection. */
export const Intersection3D = forwardRef<Intersection3DHandle, Intersection3DProps>(
  function Intersection3D({ input, className, style, ...options }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<IntersectionSceneHandle | null>(null);
    const builtRef = useRef<{ input: IntersectionInput; optionsKey: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const optionsKey = JSON.stringify(options);

    useImperativeHandle(ref, () => ({
      toDataUrl: (type, quality) => sceneRef.current?.snapshot(type, quality) ?? null,
    }));

    // Created once on mount; later prop changes go through update() below.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      try {
        sceneRef.current = createIntersectionScene(container, input, options);
        builtRef.current = { input, optionsKey };
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "WebGL is not available");
      }
      return () => {
        sceneRef.current?.dispose();
        sceneRef.current = null;
        builtRef.current = null;
      };
    }, []);

    useEffect(() => {
      const scene = sceneRef.current;
      const built = builtRef.current;
      if (!scene || !built) return;
      if (built.input === input && built.optionsKey === optionsKey) return;
      const reframe = built.input.signalId !== input.signalId;
      builtRef.current = { input, optionsKey };
      scene.update(input, options, reframe);
    }, [input, optionsKey]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ position: "relative", width: "100%", height: "100%", ...style }}
      >
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              color: "#6b7280",
            }}
          >
            3D view unavailable: {error}
          </div>
        )}
      </div>
    );
  },
);
