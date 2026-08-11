// Render an on-screen <svg> to a JPG and trigger a download.
//
// Dimensions come from the element's own viewBox, so diagrams that grow
// taller (e.g. street names stacking onto extra lines) export in full
// instead of being cropped to a hard-coded size.
export function downloadSvgAsJpg(
  svg: SVGSVGElement,
  fileName: string,
  scale = 2,
): void {
  const box = svg.viewBox.baseVal;
  const width = box?.width || svg.clientWidth || 340;
  const height = box?.height || svg.clientHeight || 384;

  // Clone with explicit dimensions — an <img> needs them to rasterize.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const svgData = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(
    new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }),
  );

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      return;
    }

    // JPG has no alpha, so paint the background before drawing.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      'image/jpeg',
      0.95,
    );

    URL.revokeObjectURL(svgUrl);
  };
  img.src = svgUrl;
}

// Standard file name for an exported phase diagram, e.g.
// "1234.Phase Diagram-app.gtss.dev.jpg".
export function phaseDiagramFileName(signalId?: string | null): string {
  return `${signalId || 'signal'}.Phase Diagram-app.gtss.dev.jpg`;
}
