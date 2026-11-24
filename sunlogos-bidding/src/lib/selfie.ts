function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = src;
  });
}

export async function compressSelfie(blob: Blob): Promise<string> {
  const src = URL.createObjectURL(blob);
  try {
    const img = await loadImage(src);
    const size = 384;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No canvas");
    const min = Math.min(img.width, img.height);
    const sx = (img.width - min) / 2;
    const sy = (img.height - min) / 2;
    ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
    const data = canvas.toDataURL("image/jpeg", 0.72);
    if (data.length > 260_000) {
      return canvas.toDataURL("image/jpeg", 0.55);
    }
    return data;
  } finally {
    URL.revokeObjectURL(src);
  }
}
