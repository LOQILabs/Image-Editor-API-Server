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
    const highlightColor = '#ff002fff'; // Your accent fill color
    const highlightStrokeColor = '#830000ff'; // Accent outline

    const maxTextWidth = width * 0.5;
    const words = caption.split(' ');
    let line = '';
    let y = paddingY;

    function isHighlightWord(wordGroup) {
      // List of keywords in English and Arabic
      const accentWords = [
        'ai agent',
        'agent ai',
        'loqi labs',
        'وكيل الذكاء الاصطناعي',      // AI Agent
        'الذكاء الاصطناعي',            // Artificial Intelligence
        'وكيل ai',                    // AI Agent (alternate)
        'لوجي لابز',                  // LOQI Labs (transliteration)
        'وكيل لوجي',                  // LOQI Agent
        'وكيل لوكي',                  // LOQI Agent (alternate spelling)
        'لوكي لابز',                  // LOQI Labs (alternate transliteration)
      ];

      return accentWords.includes(normalized);
    }

    let i = 0;
    while (i < words.length) {
      let lineWords = [];
      let lineWidth = 0;

      while (i < words.length) {
        const word = words[i];
        const testLine = [...lineWords, word].join(' ') + ' ';
        const testWidth = ctx.measureText(testLine).width;

        if (testWidth > maxTextWidth && lineWords.length > 0) break;

        lineWords.push(word);
        lineWidth = testWidth;
        i++;
      }

      // Draw each word with conditional highlighting
      let xCursor = width - paddingX - lineWidth;
      for (let j = 0; j < lineWords.length; j++) {
        const current = lineWords[j];
        const next = lineWords[j + 1] || '';
        const twoWordCombo = `${current} ${next}`.toLowerCase();

        let drawWord = current;
        let measure = ctx.measureText(drawWord + ' ').width;

        // Check for 2-word highlight (like "AI Agent" or "LOQI Labs")
        if (j < lineWords.length - 1 && isHighlightWord(twoWordCombo)) {
          ctx.strokeStyle = highlightStrokeColor;
          ctx.fillStyle = highlightColor;
          ctx.strokeText(twoWordCombo, xCursor, y);
          ctx.fillText(twoWordCombo, xCursor, y);
          const comboWidth = ctx.measureText(twoWordCombo + ' ').width;
          xCursor += comboWidth;
          j++; // skip next word
          continue;
        }

        // Check for single-word highlight
        if (isHighlightWord(drawWord)) {
          ctx.strokeStyle = highlightStrokeColor;
          ctx.fillStyle = highlightColor;
        } else {
          ctx.strokeStyle = '#000000';
          ctx.fillStyle = '#ffe5c8ff';
        }

        ctx.strokeText(drawWord, xCursor, y);
        ctx.fillText(drawWord, xCursor, y);
        xCursor += measure;
      }

      y += fontSize * 1.1;
    }

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
