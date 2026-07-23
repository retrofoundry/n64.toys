export type TextureDeclaration = {
  name: string;
  width: number;
  height: number;
  format: string;
};

const TEXTURE_DECLARATION =
  /^\s*Texture\s+([A-Za-z_]\w*)\s*=\s*\{\s*(\d+)\s*,\s*(\d+)\s*,\s*([A-Za-z0-9]+)\s*\}/;

export function parseTextureDeclarations(
  source: string,
): TextureDeclaration[] {
  const declarations: TextureDeclaration[] = [];

  for (const line of source.split(/\r?\n/)) {
    const match = TEXTURE_DECLARATION.exec(line);
    if (match === null) {
      continue;
    }

    declarations.push({
      name: match[1],
      width: Number(match[2]),
      height: Number(match[3]),
      format: match[4],
    });
  }

  return declarations;
}
