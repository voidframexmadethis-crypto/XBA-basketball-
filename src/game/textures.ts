import * as THREE from 'three';
import {
  BACKBOARD_X,
  CENTER_CIRCLE_RADIUS,
  COURT_LENGTH,
  COURT_WIDTH,
  FREE_THROW_LINE_X,
  HALF_COURT_X,
  HALF_COURT_Z,
  HOOP_X,
  KEY_WIDTH,
  THREE_POINT_CORNER_Z,
  THREE_POINT_RADIUS,
} from './constants';

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createCourtTextures(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const width = 2048;
  const height = 1024;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rCtx = roughCanvas.getContext('2d')!;

  const rand = seededRand(42024);

  // Convert court meters (x in [-HALF_COURT_X, HALF_COURT_X], z in [-HALF_COURT_Z, HALF_COURT_Z])
  // onto apron + regulation floor. Let's map apron outside court lines too!
  const apronMarginX = 2.6;
  const apronMarginZ = 2.4;
  const totalLen = COURT_LENGTH + apronMarginX * 2;
  const totalWid = COURT_WIDTH + apronMarginZ * 2;

  const toPxX = (x: number) => ((x + totalLen / 2) / totalLen) * width;
  const toPxY = (z: number) => ((z + totalWid / 2) / totalWid) * height;
  const scaleX = width / totalLen;
  const scaleY = height / totalWid;

  // 1. Dark Navy/Slate Apron Border
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);
  rCtx.fillStyle = '#585858';
  rCtx.fillRect(0, 0, width, height);

  // 2. Hardwood Maple Floor inside court + slight apron edge
  const courtLeft = toPxX(-HALF_COURT_X);
  const courtRight = toPxX(HALF_COURT_X);
  const courtTop = toPxY(-HALF_COURT_Z);
  const courtBottom = toPxY(HALF_COURT_Z);

  ctx.save();
  ctx.beginPath();
  ctx.rect(courtLeft - 14, courtTop - 14, courtRight - courtLeft + 28, courtBottom - courtTop + 28);
  ctx.clip();

  // Base warm maple fill
  ctx.fillStyle = '#d4a36a';
  ctx.fillRect(0, 0, width, height);
  rCtx.fillStyle = '#363636';
  rCtx.fillRect(0, 0, width, height);

  // Maple strips running along length (X)
  const plankRows = 86;
  const plankH = height / plankRows;
  for (let row = 0; row < plankRows; row++) {
    const y = row * plankH;
    let x = -(rand() * 140);
    while (x < width) {
      const plankW = 90 + rand() * 150;
      const tone = rand();
      const r = Math.round(202 + tone * 32 - 10);
      const g = Math.round(150 + tone * 28 - 8);
      const b = Math.round(92 + tone * 22 - 6);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, plankW, plankH);

      // Subtle wood grain streaks
      ctx.fillStyle = `rgba(110, 68, 28, ${0.04 + rand() * 0.06})`;
      for (let gLine = 0; gLine < 3; gLine++) {
        const gy = y + rand() * plankH;
        ctx.fillRect(x + 2, gy, plankW - 4, 1);
      }

      // Plank seam
      ctx.strokeStyle = 'rgba(85, 50, 20, 0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, plankW, plankH);

      // Matching subtle roughness variation per plank
      const roughVal = Math.round(42 + tone * 26);
      rCtx.fillStyle = `rgb(${roughVal},${roughVal},${roughVal})`;
      rCtx.fillRect(x, y, plankW, plankH);

      x += plankW;
    }
  }

  // Painted Keys (Left and Right)
  const drawPaint = (side: -1 | 1) => {
    const xStart = side === -1 ? -HALF_COURT_X : FREE_THROW_LINE_X;
    const xEnd = side === -1 ? -FREE_THROW_LINE_X : HALF_COURT_X;
    const px = toPxX(xStart);
    const pw = toPxX(xEnd) - px;
    const py = toPxY(-KEY_WIDTH / 2);
    const ph = toPxY(KEY_WIDTH / 2) - py;

    ctx.fillStyle = 'rgba(29, 78, 216, 0.88)';
    ctx.fillRect(px, py, pw, ph);

    // Subtle lacquer gloss on paint
    rCtx.fillStyle = '#242424';
    rCtx.fillRect(px, py, pw, ph);
  };
  drawPaint(-1);
  drawPaint(1);

  // Center Court Crest (Royal Crown/Diamond Shield)
  const cx = toPxX(0);
  const cy = toPxY(0);
  const cr = CENTER_CIRCLE_RADIUS * scaleX;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, cr - 6, 0, Math.PI * 2);
  ctx.stroke();

  // Center emblem text
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('METRO', cx, cy - 16);
  ctx.fillStyle = '#eab308';
  ctx.font = '700 30px sans-serif';
  ctx.fillText('ROYALS', cx, cy + 26);

  ctx.restore();

  // Apron border team wordmarks along baselines
  ctx.save();
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(courtLeft - 14, courtTop - 14, courtRight - courtLeft + 28, 14);
  ctx.fillRect(courtLeft - 14, courtBottom, courtRight - courtLeft + 28, 14);
  ctx.fillRect(courtLeft - 14, courtTop - 14, 14, courtBottom - courtTop + 28);
  ctx.fillRect(courtRight, courtTop - 14, 14, courtBottom - courtTop + 28);

  // Baseline text
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '800 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(toPxX(-HALF_COURT_X - 1.3), cy);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('METROPOLITAN ARENA', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(toPxX(HALF_COURT_X + 1.3), cy);
  ctx.rotate(Math.PI / 2);
  ctx.fillText('COURTVISION PRO', 0, 0);
  ctx.restore();
  ctx.restore();

  // 3. Crisp Regulation White Court Lines
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 3.5;

  // Outer Boundary
  ctx.strokeRect(courtLeft, courtTop, courtRight - courtLeft, courtBottom - courtTop);

  // Half-court line
  ctx.beginPath();
  ctx.moveTo(cx, courtTop);
  ctx.lineTo(cx, courtBottom);
  ctx.stroke();

  // Center circle outer
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.stroke();

  // Draw Left & Right Half-Court Markings
  const drawHalfMarkings = (side: -1 | 1) => {
    const hoopPxX = toPxX(side * HOOP_X);
    const baselinePxX = toPxX(side * HALF_COURT_X);
    const ftLinePxX = toPxX(side * FREE_THROW_LINE_X);
    const keyTopPx = toPxY(-KEY_WIDTH / 2);
    const keyBotPx = toPxY(KEY_WIDTH / 2);

    // Key box
    ctx.strokeRect(
      Math.min(baselinePxX, ftLinePxX),
      keyTopPx,
      Math.abs(ftLinePxX - baselinePxX),
      keyBotPx - keyTopPx
    );

    // Free-throw circle
    const ftRadiusPx = 1.83 * scaleX;
    ctx.beginPath();
    if (side === -1) {
      ctx.arc(ftLinePxX, cy, ftRadiusPx, -Math.PI / 2, Math.PI / 2);
    } else {
      ctx.arc(ftLinePxX, cy, ftRadiusPx, Math.PI / 2, (Math.PI * 3) / 2);
    }
    ctx.stroke();

    // Dashed inner FT arc
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    if (side === -1) {
      ctx.arc(ftLinePxX, cy, ftRadiusPx, Math.PI / 2, (Math.PI * 3) / 2);
    } else {
      ctx.arc(ftLinePxX, cy, ftRadiusPx, -Math.PI / 2, Math.PI / 2);
    }
    ctx.stroke();
    ctx.restore();

    // Restricted area arc (1.22m radius from hoop center)
    const raRadiusPx = 1.22 * scaleX;
    ctx.beginPath();
    if (side === -1) {
      ctx.arc(hoopPxX, cy, raRadiusPx, -Math.PI / 2, Math.PI / 2);
    } else {
      ctx.arc(hoopPxX, cy, raRadiusPx, Math.PI / 2, (Math.PI * 3) / 2);
    }
    ctx.stroke();

    // Three-Point Arc + Straight Corners
    const cornerZPxTop = toPxY(-THREE_POINT_CORNER_Z);
    const cornerZPxBot = toPxY(THREE_POINT_CORNER_Z);
    const threeRadiusPx = THREE_POINT_RADIUS * scaleX;

    // Intersection dx where circle meets corner Z
    const dx = Math.sqrt(Math.max(0, THREE_POINT_RADIUS * THREE_POINT_RADIUS - THREE_POINT_CORNER_Z * THREE_POINT_CORNER_Z));
    const arcMeetX = side === -1 ? -HOOP_X + dx : HOOP_X - dx;
    const arcMeetPxX = toPxX(arcMeetX);
    const meetAngle = Math.asin(THREE_POINT_CORNER_Z / THREE_POINT_RADIUS);

    ctx.beginPath();
    ctx.moveTo(baselinePxX, cornerZPxTop);
    ctx.lineTo(arcMeetPxX, cornerZPxTop);
    if (side === -1) {
      ctx.arc(hoopPxX, cy, threeRadiusPx, -meetAngle, meetAngle, false);
    } else {
      ctx.arc(hoopPxX, cy, threeRadiusPx, Math.PI - meetAngle, Math.PI + meetAngle, false);
    }
    ctx.lineTo(baselinePxX, cornerZPxBot);
    ctx.stroke();

    // Key hash marks
    const hashOffsets = [2.1, 3.0, 3.9, 4.8];
    hashOffsets.forEach((dist) => {
      const hx = toPxX(side === -1 ? -HALF_COURT_X + dist : HALF_COURT_X - dist);
      ctx.beginPath();
      ctx.moveTo(hx, keyTopPx);
      ctx.lineTo(hx, keyTopPx - 8);
      ctx.moveTo(hx, keyBotPx);
      ctx.lineTo(hx, keyBotPx + 8);
      ctx.stroke();
    });

    // Backboard baseline reference tick
    const bbX = toPxX(side * BACKBOARD_X);
    ctx.beginPath();
    ctx.moveTo(bbX, cy - 16);
    ctx.lineTo(bbX, cy + 16);
    ctx.stroke();
  };

  drawHalfMarkings(-1);
  drawHalfMarkings(1);

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;
  colorMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAnisotropy;
  roughnessMap.needsUpdate = true;

  return { colorMap, roughnessMap };
}

export function createBasketballTextures(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Rich Wilson/Spalding leather orange
  ctx.fillStyle = '#c85a17';
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const rand = seededRand(9012);
  // Leather pebbles
  for (let i = 0; i < 6500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1.1 + rand() * 1.1;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255, 165, 95, 0.14)' : 'rgba(95, 32, 6, 0.16)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    bCtx.fillStyle = '#bdbdbd';
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Deep black channel seams
  const drawSeam = (fn: (c: CanvasRenderingContext2D) => void) => {
    ctx.strokeStyle = '#181412';
    ctx.lineWidth = 7;
    fn(ctx);
    bCtx.strokeStyle = '#101010';
    bCtx.lineWidth = 8;
    fn(bCtx);
  };

  drawSeam((c) => {
    c.beginPath();
    c.moveTo(0, size / 2);
    c.lineTo(size, size / 2);
    c.stroke();

    c.beginPath();
    c.moveTo(size / 2, 0);
    c.lineTo(size / 2, size);
    c.stroke();

    // Curved rib channels
    c.beginPath();
    c.ellipse(size * 0.25, size / 2, size * 0.2, size * 0.45, 0, 0, Math.PI * 2);
    c.stroke();

    c.beginPath();
    c.ellipse(size * 0.75, size / 2, size * 0.2, size * 0.45, 0, 0, Math.PI * 2);
    c.stroke();
  });

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { colorMap, bumpMap };
}

export function createJerseyTexture(
  primaryColor: string,
  secondaryColor: string,
  accentColor: string,
  textColor: string,
  jerseyNumber: number,
  teamShortName: string
): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryColor;
  ctx.fillRect(0, 0, w, h);

  // Side panels / athletic stripes
  ctx.fillStyle = secondaryColor;
  ctx.fillRect(0, 0, 22, h);
  ctx.fillRect(w - 22, 0, 22, h);

  ctx.fillStyle = accentColor;
  ctx.fillRect(22, 0, 6, h);
  ctx.fillRect(w - 28, 0, 6, h);

  // Front & back halves mapped around cylinder/torso
  // Front (around u = 0.25 -> x=64, or centered depending on box/cylinder)
  // For torso BoxGeometry, we can use dedicated front/back textures, or put number centered!
  ctx.fillStyle = textColor;
  ctx.font = '800 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamShortName, w / 2, 68);

  ctx.fillStyle = secondaryColor;
  ctx.font = '900 108px sans-serif';
  ctx.fillText(String(jerseyNumber), w / 2, 148);

  // Crisp outline
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.strokeText(String(jerseyNumber), w / 2, 148);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(5, 8, 16, 0.72)');
  grad.addColorStop(0.5, 'rgba(5, 8, 16, 0.34)');
  grad.addColorStop(1, 'rgba(5, 8, 16, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRibbonBoardTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.25, '#1e3a8a');
  grad.addColorStop(0.5, '#0f172a');
  grad.addColorStop(0.75, '#991b1b');
  grad.addColorStop(1, '#0f172a');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#eab308';
  ctx.fillRect(0, 0, w, 6);
  ctx.fillRect(0, h - 6, w, 6);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('METROPOLITAN ROYALS   •   PRO BASKETBALL NIGHT   •   COURTVISION', w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createShotClockTexture(seconds: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  updateShotClockCanvas(ctx, texture, seconds);
  return { canvas, ctx, texture };
}

export function updateShotClockCanvas(
  ctx: CanvasRenderingContext2D,
  texture: THREE.CanvasTexture,
  seconds: number
) {
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 120);

  const displayVal = seconds < 5 ? seconds.toFixed(1) : Math.ceil(seconds).toString();
  ctx.fillStyle = seconds <= 5 ? '#ef4444' : '#f59e0b';
  ctx.font = '800 84px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayVal, 128, 68);
  texture.needsUpdate = true;
}
