import type { LoadedTideAssets, TideAssetMode } from './types';

export const ORIGINAL_ASSET_MANIFEST = {
  character: '/assets/tide-original/fisherman-motion.png',
  portrait: '/assets/tide-original/fisherman-portrait.png',
  icons: '/assets/tide-original/tide-icon-atlas.png',
  combat: '/assets/tide-original/tide-combat-atlas.png',
} as const;

export const REFERENCE_ASSET_MANIFEST = {
  woodTile: '/__tide-reference/wood-tile.png',
  platformEdge: '/__tide-reference/platform-edge.png',
  slotFrame: '/__tide-reference/slot-frame.png',
} as const;

let fallbackWarningShown = false;

export const resolveAssetSelection = (
  requested: TideAssetMode,
  referenceReady: boolean,
): TideAssetMode => requested === 'reference' && referenceReady ? 'reference' : 'original';

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Unable to load ${source}`));
  image.src = source;
});

export const loadTideVisualAssets = async (): Promise<LoadedTideAssets> => {
  const [character, combat] = await Promise.all([
    loadImage(ORIGINAL_ASSET_MANIFEST.character).catch(() => null),
    loadImage(ORIGINAL_ASSET_MANIFEST.combat).catch(() => null),
  ]);
  const requested: TideAssetMode = __TIDE_ART_MODE__;

  if (requested === 'reference') {
    const reference = await Promise.all([
      loadImage(REFERENCE_ASSET_MANIFEST.woodTile),
      loadImage(REFERENCE_ASSET_MANIFEST.platformEdge),
      loadImage(REFERENCE_ASSET_MANIFEST.slotFrame),
    ]).catch(() => null);
    if (reference) {
      return {
        mode: 'reference',
        character,
        woodTile: reference[0],
        platformEdge: reference[1],
        slotFrame: reference[2],
        combat,
      };
    }
    if (!fallbackWarningShown) {
      fallbackWarningShown = true;
      console.warn('[潮线之后] 本地参考素材不可用，已回退到原创素材。');
    }
  }

  return { mode: 'original', character, woodTile: null, platformEdge: null, slotFrame: null, combat };
};
