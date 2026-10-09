import http from 'http';
import fs from 'fs/promises';
import path from 'path';

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

        // 1. Ensure thumbnails directory exists
        const thumbDir = path.join(process.cwd(), 'thumbnails');
        await fs.mkdir(thumbDir, { recursive: true });

        // 2. Write JPEG thumbnail image
        const base64Data = thumbnailBase64.replace(/^data:image\/jpeg;base64,/, '');
        const thumbPath = path.join(thumbDir, `${preset.id}.jpg`);
        await fs.writeFile(thumbPath, Buffer.from(base64Data, 'base64'));

        // 3. Update presets.json
        const presetsPath = path.join(process.cwd(), 'presets.json');
        let presets = [];
        try {
          const content = await fs.readFile(presetsPath, 'utf8');
          presets = JSON.parse(content);
        } catch {
          presets = [];
        }
        
        // Replace existing or append
        const index = presets.findIndex(p => p.id === preset.id);
        if (index >= 0) presets[index] = preset;
        else presets.push(preset);

        await fs.writeFile(presetsPath, JSON.stringify(presets, null, 2));

        // 4. Update thumbnails.json index
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

server.listen(PORT, () => console.log(`Admin Server active on http://localhost:${PORT}`));