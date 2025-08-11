// server.js
const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const multer = require('multer');
const { createCanvas, loadImage, registerFont } = require('canvas');
const upload = multer();
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// ====== (1) CONFIG: public dir + base URL for links ======
const PUBLIC_DIR = path.join(__dirname, 'public', 'images'); // where files are saved
const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://image-editor-api-server.onrender.com'; // <-- set this env var in prod

// fonts
registerFont(path.join(__dirname, 'fonts', 'Satoshi-Black.otf'), { family: 'Satoshi' });

const app = express();

// ====== (2) STATIC HOSTING: serve saved images at /images/... ======
app.use('/images', express.static(PUBLIC_DIR, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
}));

//------------------------------------------------(GET - for status check)------------------------------------------------------
app.get('/status', (req, res) => {
  console.log(' => Status Request Made.....');
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  console.log(' <= Status Update Send!');
});

//------------------------------------------------(POST - image and get a PUBLIC URL back)--------------------------------------
app.post('/process', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

  try {
    const logoUrl = req.query.logo;
    const caption = req.body.caption || '';
    const loqiUrl = req.body.loqi;
    const fontSizeFactor = parseFloat(req.body.fontSizeFactor) || 1.0;
    const xOffset = parseFloat(req.body.xOffset) || 0.1;
    const yOffset = parseFloat(req.body.yOffset) || 0.5;
    const textWidthRatio = parseFloat(req.body.textWidthRatio) || 0.5;
    const baseImageBuffer = req.file.buffer;

    const [logoResponse, loqiResponse] = await Promise.all([
      axios.get(logoUrl, { responseType: 'arraybuffer' }),
      axios.get(loqiUrl, { responseType: 'arraybuffer' })
    ]);

    const logoBuffer = Buffer.from(logoResponse.data);
    const loqiBuffer = Buffer.from(loqiResponse.data);

    const meta = await sharp(baseImageBuffer).metadata();
    const width = meta.width;
    const height = meta.height;

    const logoSize = Math.floor(height * 0.1);
    const padding = Math.floor(height * 0.03);
    const spacing = Math.floor(width * 0.01); // 1% horizontal gap

    const logoResized = await sharp(logoBuffer).resize({ height: logoSize }).toBuffer();

    // Resize loqi while maintaining aspect ratio
    const loqiMetadata = await sharp(loqiBuffer).metadata();
    const loqiWidth = Math.floor((loqiMetadata.width / loqiMetadata.height) * logoSize);
    const loqiResized = await sharp(loqiBuffer).resize({ height: logoSize }).toBuffer();

    // Draw image
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const blurredImageBuffer = await sharp(baseImageBuffer).blur(5).toBuffer();
    const baseImage = await loadImage(blurredImageBuffer);
    ctx.drawImage(baseImage, 0, 0, width, height);

    // Text
    const paddingY = Math.floor(width * yOffset);
    const paddingX = Math.floor(width * xOffset);
    let fontSize = Math.floor(width * fontSizeFactor);
    ctx.font = `${fontSize}px Satoshi`;
    ctx.fillStyle = '#fffaf5ff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = fontSize * 0.08;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowOffsetX = fontSize * 0.08;
    ctx.shadowOffsetY = ctx.shadowOffsetX;
    ctx.shadowBlur = fontSize * 0.15;

    // wrap text without overflowing bottom: shrink font if needed
    const maxTextWidth = Math.floor(width * textWidthRatio);
    const words = caption.split(' ');
    let lines = [];
    let line = '';

    const measure = (f) => {
      ctx.font = `${f}px Satoshi`;
      let tempLines = [];
      let tempLine = '';
      for (let i = 0; i < words.length; i++) {
        const testLine = tempLine + words[i] + ' ';
        const testWidth = ctx.measureText(testLine).width;
        if (testWidth > maxTextWidth && i > 0) {
          tempLines.push(tempLine.trim());
          tempLine = words[i] + ' ';
        } else {
          tempLine = testLine;
        }
      }
      if (tempLine) tempLines.push(tempLine.trim());
      return tempLines;
    };

    // shrink-to-fit vertically if needed
    lines = measure(fontSize);
    const lineHeight = Math.floor(fontSize * 1.1);
    while ((paddingY + lines.length * lineHeight) > (height - logoSize - padding * 2) && fontSize > 12) {
      fontSize = Math.floor(fontSize * 0.95);
      lines = measure(fontSize);
    }
    ctx.font = `${fontSize}px Satoshi`;

    // draw lines
    let y = paddingY;
    for (const ln of lines) {
      ctx.fillText(ln, width - paddingX, y);
      y += lineHeight;
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;

    // Load logo and loqi
    const logoImage = await loadImage(logoResized);
    const loqiImage = await loadImage(loqiResized);

    // Draw logos
    ctx.drawImage(logoImage, padding, height - logoSize - padding, logoSize, logoSize);
    const loqiX = padding + logoSize + spacing;
    ctx.drawImage(loqiImage, loqiX, height - logoSize - padding, loqiWidth, logoSize);

    // ====== (3) SAVE TO DISK and RETURN JSON URL ======
    // Ensure directory exists
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });

    const id = randomUUID();
    const filename = `${id}.png`;
    const outPath = path.join(PUBLIC_DIR, filename);

    const outBuffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outPath, outBuffer);

    // Optionally set a TTL hint (e.g., 24h)
    const ttlHours = parseInt(req.query.ttlHours || '24', 10);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

    const imageUrl = `${BASE_URL}/images/${filename}`;

    // IMPORTANT: return JSON (do NOT stream the image here)
    return res.status(200).json({
      image_url: imageUrl,
      width,
      height,
      id,
      content_type: 'image/png',
      expires_at: expiresAt
    });

  } catch (err) {
    console.error('❌ Image processing failed:', err);
    return res.status(500).json({ error: 'Failed to process image.' });
  }
});

// ====== (4) OPTIONAL: simple cleanup endpoint (delete by id) ======
app.delete('/images/:id', (req, res) => {
  const filename = `${req.params.id}.png`;
  const filePath = path.join(PUBLIC_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(filePath);
  return res.json({ deleted: true });
});

// ====== (5) OPTIONAL: health endpoint for public directory ======
app.get('/images/_health', (req, res) => {
  try {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
