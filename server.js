const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const app = express();

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.post('/process', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
  try {
    const logoUrl = req.query.logo;
    const baseImageBuffer = req.body;

    const logoResponse = await axios.get(logoUrl, {
      responseType: 'arraybuffer',
      timeout: 5000
    });
    const logoBuffer = Buffer.from(logoResponse.data);

    const { width } = await sharp(baseImageBuffer).metadata();
    const logoResized = await sharp(logoBuffer).resize({ width: Math.floor(width * 0.15) }).toBuffer();

    const compositeImage = await sharp(baseImageBuffer)
      .composite([{ input: logoResized, gravity: 'southeast' }])
      .png()
      .toBuffer();

    res.set('Content-Type', 'image/png');
    res.send(compositeImage);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to process image.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
