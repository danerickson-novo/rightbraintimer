import http from 'http';
import fs from 'fs/promises';
import { watch } from 'fs';
import path from 'path';

const PORT = 3001;
const VALID_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.svg']);

/**
 * Scans the images/ directory and rebuilds manifest.json
 */
async function generateImageManifest() {
  const imagesDir = path.join(process.cwd(), 'images');
  
  try {
    await fs.mkdir(imagesDir, { recursive: true });

    const files = await fs.readdir(imagesDir);
    const imageFiles = files
      .filter((file) => VALID_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const manifestPath = path.join(imagesDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(imageFiles, null, 2));
    console.log(`✓ Updated images/manifest.json (${imageFiles.length} images indexed)`);
  } catch (err) {
    console.error('Failed to generate image manifest:', err.message);
  }
}

/**
 * Watches the images/ folder for any file additions, deletions, or renames
 */
function watchImagesFolder() {
  const imagesDir = path.join(process.cwd(), 'images');
  let debounceTimer;

  try {
    watch(imagesDir, (eventType, filename) => {
      // Ignore changes to manifest.json itself to prevent an infinite loop
      if (filename && filename !== 'manifest.json') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          generateImageManifest();
        }, 300);
      }
    });
    console.log('👀 Live watching images/ directory for changes...');
  } catch (err) {
    console.error('Could not set up images/ folder watcher:', err.message);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/api/save-preset') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { preset, thumbnailBase64 } = JSON.parse(body);

        const thumbDir = path.join(process.cwd(), 'thumbnails');
        await fs.mkdir(thumbDir, { recursive: true });

        const base64Data = thumbnailBase64.replace(/^data:image\/jpeg;base64,/, '');
        const thumbPath = path.join(thumbDir, `${preset.id}.jpg`);
        await fs.writeFile(thumbPath, Buffer.from(base64Data, 'base64'));

        const presetsPath = path.join(process.cwd(), 'presets.json');
        let presets = [];
        try {
          const content = await fs.readFile(presetsPath, 'utf8');
          presets = JSON.parse(content);
        } catch {
          presets = [];
        }

        const index = presets.findIndex(p => p.id === preset.id);
        if (index >= 0) presets[index] = preset;
        else presets.push(preset);

        await fs.writeFile(presetsPath, JSON.stringify(presets, null, 2));

        const thumbJsonPath = path.join(process.cwd(), 'thumbnails.json');
        let thumbIndex = [];
        try {
          thumbIndex = JSON.parse(await fs.readFile(thumbJsonPath, 'utf8'));
        } catch {
          thumbIndex = [];
        }

        const tIndex = thumbIndex.findIndex(t => t.id === preset.id);
        const thumbRecord = { id: preset.id, name: preset.name, file: `thumbnails/${preset.id}.jpg` };
        if (tIndex >= 0) thumbIndex[tIndex] = thumbRecord;
        else thumbIndex.push(thumbRecord);

        await fs.writeFile(thumbJsonPath, JSON.stringify(thumbIndex, null, 2));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, async () => {
  console.log(`Admin Server active on http://localhost:${PORT}`);
  await generateImageManifest();
  watchImagesFolder();
});
