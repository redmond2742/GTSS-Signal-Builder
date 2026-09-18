# gtss-diagram

Standalone SVG renderer for GTSS intersection phase diagrams.

It draws an intersection from nothing but plain data — approach bearings and
phase movements — and returns an `<svg>` element. There is no storage access,
no global state, no CSS framework and no UI kit, so it can be dropped into any
React 18 app (or lifted into its own repository) without bringing GTSS Builder
along.

## Usage

```tsx
import { PhaseDiagram } from "gtss-diagram";

<PhaseDiagram
  phases={[{ phase: 2, approachId: "A1", movementType: "Through", isPedestrian: 1 }]}
  approaches={[{ approachId: "A1", compassBearing: 180, streetName: "Main St" }]}
  intersectionName="Main St & 1st Ave"
  intersectionId="1234"
  isLht={false}
/>;
```

## Props

| Prop               | Required | Notes                                                           |
| ------------------ | -------- | --------------------------------------------------------------- |
| `phases`           | yes      | Phase number, approach, movement type, pedestrian mode.         |
| `approaches`       | yes      | Approach ID, compass bearing, street name, free-right config.   |
| `isLht`            | yes      | Left-hand traffic — mirrors lanes and turn geometry.            |
| `intersectionName` | no       | Header title; omitted renders a compact diagram with no header. |
| `intersectionId`   | no       | Drawn large in the center of the intersection.                  |
| `svgRef`           | no       | Ref to the root `<svg>`, e.g. to export it as an image.         |

`isLht` is a required input rather than something the renderer looks up. That
is the whole reason this package is free-standing: handedness is the only
piece of agency context the diagram needs, and the host app supplies it. In
GTSS Builder that call is `isLhtForSignalId(signalId)`.

## Exporting the diagram

The renderer only draws. To save the result as an image, hand the `svgRef`
element to any SVG-to-raster helper — GTSS Builder uses `downloadSvgAsJpg`
from the `gtss` package.
