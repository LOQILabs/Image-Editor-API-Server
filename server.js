const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const upload = multer();

const app = express();

app.post('/process', upload.single('image'), async (req, res) => {
  try {
    const logoUrl = req.query.logo;
    const caption = req.body.caption;
    const loqiUrl = req.body.loqi;
    const language = req.body.language;
    const baseImageBuffer = req.file.buffer;

    const [logoResponse, loqiResponse] = await Promise.all([
      axios.get(logoUrl, { responseType: 'arraybuffer' }),
      axios.get(loqiUrl, { responseType: 'arraybuffer' })
    ]);

    const logoBuffer = Buffer.from(logoResponse.data);
    const loqiBuffer = Buffer.from(loqiResponse.data);

    const { width, height } = await sharp(baseImageBuffer).metadata();
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
    const paddingY = height * 0.13;
    const paddingX = height * 0.13;
    const fontSize = Math.floor(height * (language == "en" ? 0.12 : 0.06) );
    ctx.font = `bold ${fontSize}px Helvetica`;
    ctx.fillStyle = '#ffe5c8ff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = fontSize * 0.08;

    const textShadow = {
      color: 'rgba(0.0, 0.0, 0.0, 1.0)',
      offsetX: height * 0.1,
      offsetY: height * 0.1,
      blur: height * 0.03
    };

    ctx.shadowColor = textShadow.color;
    ctx.shadowOffsetX = textShadow.offsetX;
    ctx.shadowOffsetY = textShadow.offsetY;
    ctx.shadowBlur = textShadow.blur;

    const maxTextWidth = width * 0.5;
    const words = caption.split(' ');
    let line = '';
    let y = paddingY;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxTextWidth && i > 0) {
        ctx.strokeText(line.trim(), width - paddingX, y);
        ctx.fillText(line.trim(), width - paddingX, y);
        line = words[i] + ' ';
        y += fontSize * 1.1;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.strokeText(line.trim(), width - paddingX, y);
      ctx.fillText(line.trim(), width - paddingX, y);
    }

    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;

    // Load logo and loqi
    const logoImage = await loadImage(logoResized);
    const loqiImage = await loadImage(loqiResized);

    // Draw logo
    ctx.drawImage(logoImage, padding, height - logoSize - padding, logoSize, logoSize);

    // Draw loqi right next to logo
    const loqiX = padding + logoSize + spacing;
    ctx.drawImage(loqiImage, loqiX, height - logoSize - padding, loqiWidth, logoSize);

    // Send final image
    res.set('Content-Type', 'image/png');
    canvas.createPNGStream().pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to process image.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
