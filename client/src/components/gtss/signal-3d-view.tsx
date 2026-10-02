import { Intersection3D, type IntersectionInput } from "gtss-3d";

interface Signal3DViewProps {
  input: IntersectionInput;
  isLht: boolean;
  isMetric: boolean;
}

export default function Signal3DView({ input, isLht, isMetric }: Signal3DViewProps) {
  return (
    <Intersection3D input={input} isLht={isLht} isMetric={isMetric} className="h-full w-full" />
  );
}
