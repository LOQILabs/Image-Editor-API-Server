const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const multer = require('multer');
const { createCanvas, loadImage } = require('canvas');
const upload = multer();

const app = express();

const path = require('path');
const { registerFont } = require('canvas');

registerFont(path.join(__dirname, 'fonts', 'Satoshi-Black.otf'), { family: 'Satoshi' });
//---------------------------------------------------------------------------------------------------


//------------------------------------------------(GET - for status check)------------------------------------------------------

app.get('/status', (req, res) => {
  console.log(' => Status Request Made.....');
  res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  console.log(' <= Status Update Send!');
});


//------------------------------------------------(POST - image and get edited image)------------------------------------------------------


app.post('/process', upload.single('image'), async (req, res) => {

  if (!req.file) {
    return res.status(400).send('No image uploaded.');
  }

  try {
    const logoUrl = req.query.logo;
    const caption = req.body.caption;
    const loqiUrl = req.body.loqi;
    const fontSizeFactor = parseFloat(req.body.fontSizeFactor) || 1.0;
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
    const fontSize = Math.floor(height * fontSizeFactor );
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

    const maxTextWidth = width * 0.5;
    const words = caption.split(' ');
    let line = '';
    let y = paddingY;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxTextWidth && i > 0) {
      //  ctx.strokeText(line.trim(), width - paddingX, y);
        ctx.fillText(line.trim(), width - paddingX, y);
        line = words[i] + ' ';
        y += fontSize * 1.1;
      } else {
        line = testLine;
      }
    }
    if (line) {
  //    ctx.strokeText(line.trim(), width - paddingX, y);
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
    const buffer = canvas.toBuffer('image/png');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename="data.png"');
    res.status(200).send(buffer);
    console.log('✅ Image successfully generated and streaming.');

    canvas.createPNGStream().pipe(res);

  } catch (err) {
    console.error('❌ Image processing failed:', err);
    res.status(500).send('Failed to process image.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
