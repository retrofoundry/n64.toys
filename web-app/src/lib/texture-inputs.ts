export const MAX_TEXTURES = 8;
export const MAX_TEXTURE_DIMENSION = 512;
export const MAX_TEXTURE_PNG_BYTES = 1024 * 1024;
export const MAX_TEXTURE_TOTAL_PNG_BYTES = 4 * 1024 * 1024;

export type TextureDeclaration = {
  name: string;
  width: number;
  height: number;
  format: string;
  line: number;
};

export type TextureAsset = {
  previewUrl: string;
  png: Blob;
  rgba: Uint8Array;
  width: number;
  height: number;
};

export type TextureSlot = {
  declaration: TextureDeclaration;
  asset?: TextureAsset;
  error?: string;
  uploadError?: string;
};

export function reconcileTextureSlots(
  previous: TextureSlot[],
  declarations: TextureDeclaration[],
): { slots: TextureSlot[]; orphaned: TextureAsset[] } {
  const previousByName = new Map<string, TextureSlot>();
  for (const slot of previous) {
    const retained = previousByName.get(slot.declaration.name);
    if (!retained || (!retained.asset && slot.asset)) {
      previousByName.set(slot.declaration.name, slot);
    }
  }
  const seenNames = new Set<string>();
  const slots = declarations.flatMap((declaration) => {
    if (seenNames.has(declaration.name)) return [];
    seenNames.add(declaration.name);
    const previousSlot = previousByName.get(declaration.name);
    const asset = previousSlot?.asset;
    const error =
      asset &&
      (asset.width !== declaration.width || asset.height !== declaration.height)
        ? `${declaration.name} declares ${declaration.width}x${declaration.height} but image is ${asset.width}x${asset.height}`
        : undefined;
    return [
      {
        declaration,
        asset,
        error,
        ...(previousSlot?.uploadError
          ? { uploadError: previousSlot.uploadError }
          : {}),
      },
    ];
  });
  const retainedAssets = new Set(
    slots.flatMap((slot) => (slot.asset ? [slot.asset] : [])),
  );
  const orphaned: TextureAsset[] = [];
  for (const slot of previous) {
    if (
      slot.asset &&
      !retainedAssets.has(slot.asset) &&
      !orphaned.includes(slot.asset)
    ) {
      orphaned.push(slot.asset);
    }
  }
  return { slots, orphaned };
}

export function validateTextureLimits(
  declarations: TextureDeclaration[],
): string | undefined {
  if (declarations.length > MAX_TEXTURES)
    return "a toy supports at most 8 textures";
  const oversized = declarations.find(
    (entry) =>
      entry.width > MAX_TEXTURE_DIMENSION ||
      entry.height > MAX_TEXTURE_DIMENSION,
  );
  return oversized ? `${oversized.name} exceeds 512x512` : undefined;
}
