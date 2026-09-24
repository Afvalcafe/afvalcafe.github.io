// Pixel maps for the conveyor belt game (belt.ts): items that have no PNG sprite yet, the symbols on the bin
// lids, the products that come out of a full bin, a tiny digit font and the sad smiley above the fire.
// One character per pixel; '.' is transparent, every other character is looked up in the palette.

const OUTLINE = '#2e222f'; // same dark outline as the PNG sprites

type Palette = Record<string, string>;

export function makeSprite(rows: string[], palette: Palette): HTMLCanvasElement {
  const width = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = width;
  c.height = rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = row[x] === '.' ? undefined : palette[row[x]];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

// ---------- Items on the belt (the rest are PNGs in public/sprites) ----------

export const ITEM_MAPS: Record<string, { rows: string[]; palette: Palette }> = {
  newspaper: {
    palette: { k: OUTLINE, w: '#efe9da', g: '#9a958a', h: '#4a4540' },
    rows: [
      'kkkkkkkkkkkkkk',
      'kwwwwwwwwwwwwk',
      'kwhhhhhhhhhhwk',
      'kwwwwwwwwwwwwk',
      'kwggggwwggggwk',
      'kwwwwwwwwwwwwk',
      'kwggggwwggggwk',
      'kwwwwwwwwwwwwk',
      'kwggggwwggggwk',
      'kwwwwwwwwwwwwk',
      'kwggggwwggggwk',
      'kkkkkkkkkkkkkk',
    ],
  },
  box: {
    palette: { k: OUTLINE, b: '#c8955a', d: '#9c6b3a', t: '#e8cf95' },
    rows: [
      'kkkkkkkkkkkkkk',
      'kbbbbbttbbbbbk',
      'kbbbbbttbbbbbk',
      'kbbbbbttbbbbbk',
      'kbbbbbttbbbbbk',
      'kbbbbbttbbbbbk',
      'kbbbbbttbbbbbk',
      'kkkkkkkkkkkkkk',
      'kddddddddddddk',
      'kddddddddddddk',
      'kddddddddddddk',
      'kkkkkkkkkkkkkk',
    ],
  },
  plasticBottle: {
    palette: { k: OUTLINE, c: '#e04a3a', s: '#cfe9f5', w: '#ffffff', b: '#3a8ad6' },
    rows: [
      '...kk...',
      '..kcck..',
      '..kkkk..',
      '..kssk..',
      '.kssssk.',
      'kssssssk',
      'kwsssssk',
      'kwsssssk',
      'kbbbbbbk',
      'kbbbbbbk',
      'kwsssssk',
      'kwsssssk',
      'kssssssk',
      'kssssssk',
      '.kssssk.',
      '..kkkk..',
    ],
  },
  appleCore: {
    palette: { k: OUTLINE, r: '#c0392b', y: '#f3e6b0', n: '#5a3a22' },
    rows: [
      '....kk....',
      '....kn....',
      '..kkrrkk..',
      '.krrrrrrk.',
      '.kyyyyyyk.',
      '..kyyyyk..',
      '...kynk...',
      '...kyyk...',
      '...knyk...',
      '..kyyyyk..',
      '.kyyyyyyk.',
      '.krrrrrrk.',
      '..kkrrkk..',
      '....kk....',
    ],
  },
  banana: {
    palette: { k: OUTLINE, y: '#f2d23c', d: '#c9a227', n: '#5a3a22' },
    rows: [
      '.............kk',
      '............knk',
      'kk.........kyyk',
      'knk.......kyyyk',
      '.kyykk..kkyyyk.',
      '..kyyyyyyyyyk..',
      '...kkddddddk...',
      '.....kkkkkk....',
    ],
  },
  jar: {
    palette: { k: OUTLINE, l: '#d9a441', g: '#cfe8e4', w: '#ffffff', j: '#a8322a' },
    rows: [
      '..kkkkkkkk..',
      '..kllllllk..',
      '..kllllllk..',
      '.kkkkkkkkkk.',
      '.kggggggggk.',
      'kgwggggggggk',
      'kgwgjjjjjggk',
      'kgwjjjjjjjgk',
      'kggjjjjjjjgk',
      'kggjjjjjjjgk',
      'kggjjjjjjjgk',
      '.kgjjjjjjgk.',
      '.kkkkkkkkkk.',
    ],
  },
  phone: {
    palette: { k: OUTLINE, p: '#4a5563', s: '#9fd0a8', b: '#c9cfd6' },
    rows: [
      '......kk.',
      '......kk.',
      '.kkkkkkk.',
      'kpppppppk',
      'kpkkkkkpk',
      'kpkssskpk',
      'kpkssskpk',
      'kpkssskpk',
      'kpkkkkkpk',
      'kpppppppk',
      'kpbpbpbpk',
      'kpppppppk',
      'kpbpbpbpk',
      'kpppppppk',
      'kpbpbpbpk',
      'kpppppppk',
      '.kkkkkkk.',
    ],
  },
};

// ---------- What comes out of a full bin ----------

export const PRODUCT_MAPS: Record<string, { rows: string[]; palette: Palette }> = {
  // paper -> a stack of nice books
  paper: {
    palette: { k: OUTLINE, r: '#c0392b', b: '#3a6fd0', g: '#3f8a32', y: '#f2c230', w: '#efe9da' },
    rows: [
      '..kkkkkkkkkkk.',
      '..krrrrrrrrwk.',
      '..krryyyrrrwk.',
      '..kkkkkkkkkkk.',
      'kkkkkkkkkkk...',
      'kbbbbbbbbwk...',
      'kbbyyybbbwk...',
      'kkkkkkkkkkk...',
      '.kkkkkkkkkkkk.',
      '.kgggggggggwk.',
      '.kgggyyygggwk.',
      '.kkkkkkkkkkkk.',
    ],
  },
  // plastic -> a toy: rubber duck
  plastic: {
    palette: { k: OUTLINE, y: '#f7d133', o: '#f08a24' },
    rows: [
      '.......kkkk.....',
      '......kyyyyk....',
      '.....kyyyyyyk...',
      '.....kyyyykyk...',
      '.....kyyyyyykkk.',
      '.....kyyyyyyoook',
      '......kyyyykkkk.',
      'kk..kkkyyyykk...',
      'kykkyyyyyyyyyk..',
      'kyyyyyyyyyyyyyk.',
      'kyyyyyyyyyyyyyk.',
      '.kyyyyyyyyyyyk..',
      '..kkkkkkkkkkk...',
    ],
  },
  // organic -> compost with a young plant
  organic: {
    palette: { k: OUTLINE, g: '#4fa83a', n: '#4a2f1e', t: '#c8663a' },
    rows: [
      '..kk....kk....',
      '.kggk..kggk...',
      '.kgggkkgggk...',
      '..kgggggk.....',
      '....kgk.......',
      '....kgk.......',
      'kkkkkkkkkkkk..',
      'knnnnnnnnnnk..',
      'kkkkkkkkkkkk..',
      'kttttttttttk..',
      '.kttttttttk...',
      '.kttttttttk...',
      '..kttttttk....',
      '..kkkkkkkk....',
    ],
  },
  // glass -> nice new wine glasses
  glass: {
    palette: { k: OUTLINE, w: '#ffffff', l: '#d6eef5', r: '#a8233f' },
    rows: [
      'kkkkkkk..kkkkkkk',
      'kwllllk..kllllwk',
      'kwllllk..kllllwk',
      'krrrrrk..krrrrrk',
      '.krrrk....krrrk.',
      '..kkk......kkk..',
      '...k........k...',
      '...k........k...',
      '...k........k...',
      '.kkkkk....kkkkk.',
    ],
  },
  // electronics -> valuable earth metals recovered from it: a little heap of shiny metal nuggets
  electronics: {
    palette: { k: OUTLINE, w: '#ffffff', s: '#b8c4cf', d: '#7d8a96', c: '#d9824a', e: '#9c5530', b: '#8fa8d6', n: '#5a70a0' },
    rows: [
      '......kkk.......',
      '.....kwssk......',
      '..kkkksddkkk....',
      '.kwcckkddkwbbk..',
      '.kcceekkkbbbnk..',
      'kkkeekwsskbnnkk.',
      'kwsskksddkkkcck.',
      'ksddkkkkkbbkeek.',
      'kddkwcckkbnnkkk.',
      'kkkkceeekkkkk...',
      '....kkkk........',
    ],
  },
};

// ---------- White symbols on the bin lids ----------

export const SYMBOLS: Record<string, string[]> = {
  paper: ['wwwww..', 'wwwwww.', 'wwwwwww', 'w.....w', 'wwwwwww', 'w.....w', 'wwwwwww', 'w.....w', 'wwwwwww'],
  plastic: ['..www..', '...w...', '..www..', '.wwwww.', 'wwwwwww', '.wwwww.', '..www..', '.wwwww.', 'wwwwwww', '.wwwww.'], // cola-shaped bottle: cap, neck, bulge, waist, bulge
  organic: ['...w...', '..w....', '.wwwww.', 'wwwwwww', '..www..', '..www..', '..www..', 'wwwwwww', '.wwwww.'], // apple core: eaten on both sides
  glass: ['wwwwwww', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..', '...w...', '...w...', '...w...', '.wwwww.'],
  electronics: ['.w...w.', '.w...w.', 'wwwwwww', 'wwwwwww', 'wwwwwww', '.wwwww.', '..www..', '...w...', '...w...'], // plug
};

// ---------- 3x5 digits for the "1/3" label on a bin ----------

export const GLYPHS: Record<string, string[]> = {
  '0': ['www', 'w.w', 'w.w', 'w.w', 'www'],
  '1': ['.w.', 'ww.', '.w.', '.w.', 'www'],
  '2': ['www', '..w', 'www', 'w..', 'www'],
  '3': ['www', '..w', '.ww', '..w', 'www'],
  '/': ['..w', '..w', '.w.', 'w..', 'w..'],
};

// ---------- Red sad smiley that rises from the fire ----------

export const SMILEY = {
  palette: { k: '#5a0d0a', r: '#e0312b' },
  rows: [
    '..kkkkk..',
    '.krrrrrk.',
    'krrkrkrrk',
    'krrkrkrrk',
    'krrrrrrrk',
    'krrkkkrrk',
    'krkrrrkrk',
    '.krrrrrk.',
    '..kkkkk..',
  ],
};
