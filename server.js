const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const multer = require('multer');
const { createCanvas, registerFont, loadImage } = require('canvas');
const upload = multer();

const app = express();

app.post('/process', upload.single('image'), async (req, res) => {
  try {
    const logoUrl = req.query.logo;
    const caption = req.body.caption;
    const baseImageBuffer = req.file.buffer;

    const logoResponse = await axios.get(logoUrl, { responseType: 'arraybuffer' });
    const logoBuffer = Buffer.from(logoResponse.data);

    const { width, height } = await sharp(baseImageBuffer).metadata();
    const logoSize = Math.floor(height * 0.08);
    const padding = Math.floor(height * 0.03);

    const logoResized = await sharp(logoBuffer).resize({ height: logoSize }).toBuffer();

    // Draw text on canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const baseImage = await loadImage(baseImageBuffer);
    ctx.drawImage(baseImage, 0, 0, width, height);

    ctx.font = `${Math.floor(height * 0.05)}px Helvetica`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    const maxTextWidth = width * 0.5;
    const words = caption.split(' ');
    let line = '';
    let y = padding;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxTextWidth && i > 0) {
        ctx.fillText(line.trim(), width - padding, y);
        line = words[i] + ' ';
        y += height * 0.06;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), width - padding, y);

    // Add logo
    const logoImage = await loadImage(logoResized);
    ctx.drawImage(logoImage, width - logoSize - padding, height - logoSize - padding, logoSize, logoSize);

    res.set('Content-Type', 'image/png');
    canvas.createPNGStream().pipe(res);

  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to process image.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
