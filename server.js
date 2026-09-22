import express from 'express';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const ORIGENS_DIR = path.join(__dirname, 'origens');
const COMPACT_DIR = path.join(__dirname, 'compact');
const FRAMES_DIR = path.join(__dirname, 'frames');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.avif', '.gif'
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.flv', '.wmv', '.mpeg', '.mpg'
]);

const FRAME_FORMATS = new Set(['jpg', 'webp', 'png']);

// Redimensionamento proporcional (garantindo dimensões pares para os encoders)
function buildScaleFilters(maxWidth, maxHeight) {
  if (maxWidth && maxHeight) {
    return [
      `scale='min(${maxWidth},iw)':'min(${maxHeight},ih)':force_original_aspect_ratio=decrease`,
      'scale=trunc(iw/2)*2:trunc(ih/2)*2'
    ];
  }
  if (maxWidth) {
    return [`scale='min(${maxWidth},iw)':-2`];
  }
  if (maxHeight) {
    return [`scale=-2:'min(${maxHeight},ih)'`];
  }
  return ['scale=trunc(iw/2)*2:trunc(ih/2)*2'];
}

function runFfmpeg(args, onProcess) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    if (onProcess) onProcess(proc);

    let stderrOutput = '';
    proc.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    proc.on('close', (code) => {
      if (onProcess) onProcess(null);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg finalizou com código ${code}: ${stderrOutput.slice(-300)}`));
      }
    });

    proc.on('error', (err) => {
      if (onProcess) onProcess(null);
      reject(err);
    });
  });
}

// Extrai o primeiro frame do vídeo como imagem estática (poster)
function extractFirstFrame({ sourcePath, destPath, format, quality, scaleFilters }, onProcess) {
  const args = ['-y', '-i', sourcePath, '-map', '0:v:0', '-frames:v', '1', '-update', '1'];

  if (scaleFilters.length > 0) {
    args.push('-vf', scaleFilters.join(','));
  }

  if (format === 'jpg') {
    // Escala do ffmpeg: 2 (melhor) a 31 (pior)
    const qv = Math.round(31 - ((quality / 100) * 29));
    args.push('-q:v', String(Math.min(31, Math.max(2, qv))));
  } else if (format === 'webp') {
    args.push('-c:v', 'libwebp', '-quality', String(quality));
  }

  args.push(destPath);
  return runFfmpeg(args, onProcess);
}

function isIgnored(filename) {
  return filename.includes(':Zone.Identifier') || 
         filename.endsWith('.Zone.Identifier') || 
         filename.startsWith('.');
}

function scanMediaRecursively(dir, baseDir = dir) {
  let images = [];
  let videos = [];

  if (!fs.existsSync(dir)) {
    return { images, videos };
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = scanMediaRecursively(fullPath, baseDir);
      images = images.concat(sub.images);
      videos = videos.concat(sub.videos);
    } else if (entry.isFile() && !isIgnored(entry.name)) {
      const ext = path.extname(entry.name).toLowerCase();
      const relativePath = path.relative(baseDir, fullPath);
      const stats = fs.statSync(fullPath);
      const fileInfo = {
        name: entry.name,
        relativePath,
        absolutePath: fullPath,
        size: stats.size,
        ext
      };

      if (IMAGE_EXTENSIONS.has(ext)) {
        images.push(fileInfo);
      } else if (VIDEO_EXTENSIONS.has(ext)) {
        videos.push(fileInfo);
      }
    }
  }
  return { images, videos };
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rota de varredura para imagens e vídeos
app.get('/api/scan', (req, res) => {
  try {
    if (!fs.existsSync(ORIGENS_DIR)) {
      fs.mkdirSync(ORIGENS_DIR, { recursive: true });
    }
    const { images, videos } = scanMediaRecursively(ORIGENS_DIR);
    const { videos: compactVideos } = scanMediaRecursively(COMPACT_DIR);

    const imageBytes = images.reduce((acc, f) => acc + f.size, 0);
    const videoBytes = videos.reduce((acc, f) => acc + f.size, 0);
    const compactVideoBytes = compactVideos.reduce((acc, f) => acc + f.size, 0);

    res.json({
      success: true,
      compactVideos: {
        count: compactVideos.length,
        totalBytes: compactVideoBytes,
        files: compactVideos.map(f => ({ relativePath: f.relativePath, size: f.size, ext: f.ext }))
      },
      images: {
        count: images.length,
        totalBytes: imageBytes,
        files: images.map(f => ({ relativePath: f.relativePath, size: f.size, ext: f.ext }))
      },
      videos: {
        count: videos.length,
        totalBytes: videoBytes,
        files: videos.map(f => ({ relativePath: f.relativePath, size: f.size, ext: f.ext }))
      },
      // Compatibilidade retroativa
      count: images.length,
      totalBytes: imageBytes
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Processamento de Imagens com Sharp (SSE)
async function processImagesHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const maxWidth = req.query.maxWidth ? parseInt(req.query.maxWidth, 10) : null;
    const maxHeight = req.query.maxHeight ? parseInt(req.query.maxHeight, 10) : null;
    const quality = req.query.quality ? parseInt(req.query.quality, 10) : 80;

    const { images: files } = scanMediaRecursively(ORIGENS_DIR);

    if (files.length === 0) {
      sendEvent({ type: 'empty', message: 'Nenhuma imagem encontrada na pasta origens.' });
      res.end();
      return;
    }

    sendEvent({ type: 'start', total: files.length, mediaType: 'image' });

    if (!fs.existsSync(COMPACT_DIR)) {
      fs.mkdirSync(COMPACT_DIR, { recursive: true });
    }

    let processedCount = 0;
    let errorCount = 0;
    let totalOriginalBytes = 0;
    let totalCompactBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      totalOriginalBytes += file.size;

      const destPath = path.join(COMPACT_DIR, file.relativePath);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      try {
        let imagePipeline = sharp(file.absolutePath);
        const metadata = await imagePipeline.metadata();

        if (maxWidth || maxHeight) {
          imagePipeline = imagePipeline.resize({
            width: maxWidth || undefined,
            height: maxHeight || undefined,
            fit: sharp.fit.inside,
            withoutEnlargement: true
          });
        }

        const ext = file.ext;
        if (ext === '.jpg' || ext === '.jpeg') {
          imagePipeline = imagePipeline.jpeg({ quality, mozjpeg: true });
        } else if (ext === '.png') {
          imagePipeline = imagePipeline.png({
            quality: Math.min(100, Math.max(10, quality)),
            compressionLevel: 9,
            palette: true
          });
        } else if (ext === '.webp') {
          imagePipeline = imagePipeline.webp({ quality });
        } else if (ext === '.avif') {
          imagePipeline = imagePipeline.avif({ quality });
        } else if (ext === '.tiff' || ext === '.tif') {
          imagePipeline = imagePipeline.tiff({ quality });
        }

        await imagePipeline.toFile(destPath);

        const newStats = fs.statSync(destPath);
        totalCompactBytes += newStats.size;
        processedCount++;

        sendEvent({
          type: 'progress',
          index: i + 1,
          total: files.length,
          file: file.relativePath,
          originalSize: file.size,
          newSize: newStats.size,
          savedBytes: file.size - newStats.size,
          savedPercent: file.size > 0 ? (((file.size - newStats.size) / file.size) * 100).toFixed(1) : 0,
          originalDimensions: {
            width: metadata.width,
            height: metadata.height
          }
        });
      } catch (fileErr) {
        console.error(`Erro ao processar imagem ${file.relativePath}:`, fileErr);
        errorCount++;
        sendEvent({
          type: 'file_error',
          index: i + 1,
          total: files.length,
          file: file.relativePath,
          error: fileErr.message
        });
      }
    }

    sendEvent({
      type: 'done',
      summary: {
        total: files.length,
        processed: processedCount,
        errors: errorCount,
        totalOriginalBytes,
        totalCompactBytes,
        totalSavedBytes: totalOriginalBytes - totalCompactBytes,
        totalSavedPercent: totalOriginalBytes > 0 
          ? (((totalOriginalBytes - totalCompactBytes) / totalOriginalBytes) * 100).toFixed(1) 
          : 0
      }
    });

    res.end();
  } catch (err) {
    console.error('Erro geral no processamento de imagens:', err);
    sendEvent({ type: 'fatal_error', error: err.message });
    res.end();
  }
}

app.get('/api/process', processImagesHandler);
app.get('/api/process-images', processImagesHandler);

// Processamento de Vídeos com FFmpeg (SSE)
app.get('/api/process-videos', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let currentProcess = null;
  let isCancelled = false;

  req.on('close', () => {
    isCancelled = true;
    if (currentProcess) {
      try {
        currentProcess.kill('SIGKILL');
      } catch (e) {
        // Ignora
      }
    }
  });

  try {
    const codec = req.query.codec === 'h265' ? 'h265' : 'h264';
    const removeAudio = req.query.removeAudio === 'true';
    const crf = req.query.crf ? parseInt(req.query.crf, 10) : 24;
    const maxWidth = req.query.maxWidth ? parseInt(req.query.maxWidth, 10) : null;
    const maxHeight = req.query.maxHeight ? parseInt(req.query.maxHeight, 10) : null;

    const { videos: files } = scanMediaRecursively(ORIGENS_DIR);

    if (files.length === 0) {
      sendEvent({ type: 'empty', message: 'Nenhum vídeo encontrado na pasta origens.' });
      res.end();
      return;
    }

    sendEvent({ type: 'start', total: files.length, mediaType: 'video' });

    if (!fs.existsSync(COMPACT_DIR)) {
      fs.mkdirSync(COMPACT_DIR, { recursive: true });
    }

    let processedCount = 0;
    let errorCount = 0;
    let totalOriginalBytes = 0;
    let totalCompactBytes = 0;

    for (let i = 0; i < files.length; i++) {
      if (isCancelled) break;

      const file = files[i];
      totalOriginalBytes += file.size;

      // Manter caminho relativo e salvar como .mp4 compatível com web
      const parsedRel = path.parse(file.relativePath);
      const destRelPath = path.join(parsedRel.dir, `${parsedRel.name}.mp4`);
      const destPath = path.join(COMPACT_DIR, destRelPath);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      sendEvent({
        type: 'video_encoding_start',
        index: i + 1,
        total: files.length,
        file: file.relativePath
      });

      const scaleFilters = buildScaleFilters(maxWidth, maxHeight);

      try {
        const ffmpegArgs = ['-y', '-i', file.absolutePath];

        // Codec de Vídeo
        if (codec === 'h265') {
          ffmpegArgs.push('-c:v', 'libx265', '-tag:v', 'hvc1');
        } else {
          ffmpegArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
        }

        // Qualidade CRF e Preset
        ffmpegArgs.push('-crf', String(crf));
        ffmpegArgs.push('-preset', 'fast');

        // Áudio
        if (removeAudio) {
          ffmpegArgs.push('-an');
        } else {
          ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k');
        }

        if (scaleFilters.length > 0) {
          ffmpegArgs.push('-vf', scaleFilters.join(','));
        }

        // Otimização para reprodução rápida na web (moov atom no início)
        ffmpegArgs.push('-movflags', '+faststart');
        ffmpegArgs.push(destPath);

        await runFfmpeg(ffmpegArgs, (proc) => { currentProcess = proc; });

        const newStats = fs.statSync(destPath);
        totalCompactBytes += newStats.size;
        processedCount++;

        sendEvent({
          type: 'progress',
          index: i + 1,
          total: files.length,
          file: destRelPath,
          originalSize: file.size,
          newSize: newStats.size,
          savedBytes: file.size - newStats.size,
          savedPercent: file.size > 0 ? (((file.size - newStats.size) / file.size) * 100).toFixed(1) : 0
        });
      } catch (videoErr) {
        console.error(`Erro ao processar vídeo ${file.relativePath}:`, videoErr);
        errorCount++;
        sendEvent({
          type: 'file_error',
          index: i + 1,
          total: files.length,
          file: file.relativePath,
          error: videoErr.message
        });
      }
    }

    if (!isCancelled) {
      sendEvent({
        type: 'done',
        summary: {
          total: files.length,
          processed: processedCount,
          errors: errorCount,
          totalOriginalBytes,
          totalCompactBytes,
          totalSavedBytes: totalOriginalBytes - totalCompactBytes,
          totalSavedPercent: totalOriginalBytes > 0 
            ? (((totalOriginalBytes - totalCompactBytes) / totalOriginalBytes) * 100).toFixed(1) 
            : 0
        }
      });
      res.end();
    }
  } catch (err) {
    console.error('Erro geral no processamento de vídeos:', err);
    sendEvent({ type: 'fatal_error', error: err.message });
    res.end();
  }
});

// Extração do primeiro frame de vídeos já prontos (SSE)
app.get('/api/extract-frames', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let currentProcess = null;
  let isCancelled = false;

  req.on('close', () => {
    isCancelled = true;
    if (currentProcess) {
      try {
        currentProcess.kill('SIGKILL');
      } catch (e) {
        // Ignora
      }
    }
  });

  try {
    const sourceDir = req.query.source === 'origens' ? ORIGENS_DIR : COMPACT_DIR;
    const sourceLabel = sourceDir === ORIGENS_DIR ? 'origens' : 'compact';
    const format = FRAME_FORMATS.has(req.query.format) ? req.query.format : 'jpg';
    const quality = req.query.quality
      ? Math.min(100, Math.max(10, parseInt(req.query.quality, 10)))
      : 85;
    const maxWidth = req.query.maxWidth ? parseInt(req.query.maxWidth, 10) : null;
    const maxHeight = req.query.maxHeight ? parseInt(req.query.maxHeight, 10) : null;

    const { videos: files } = scanMediaRecursively(sourceDir);

    if (files.length === 0) {
      sendEvent({ type: 'empty', message: `Nenhum vídeo encontrado na pasta ${sourceLabel}.` });
      res.end();
      return;
    }

    sendEvent({ type: 'start', total: files.length, mediaType: 'frame' });

    if (!fs.existsSync(FRAMES_DIR)) {
      fs.mkdirSync(FRAMES_DIR, { recursive: true });
    }

    let processedCount = 0;
    let errorCount = 0;
    let totalOriginalBytes = 0;
    let totalFrameBytes = 0;

    // Sem limite de dimensão, o frame mantém a resolução nativa do vídeo
    const scaleFilters = (maxWidth || maxHeight) ? buildScaleFilters(maxWidth, maxHeight) : [];

    for (let i = 0; i < files.length; i++) {
      if (isCancelled) break;

      const file = files[i];
      totalOriginalBytes += file.size;

      const parsedRel = path.parse(file.relativePath);
      const destRelPath = path.join(parsedRel.dir, `${parsedRel.name}.${format}`);
      const destPath = path.join(FRAMES_DIR, destRelPath);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      sendEvent({
        type: 'frame_extract_start',
        index: i + 1,
        total: files.length,
        file: file.relativePath
      });

      try {
        await extractFirstFrame({
          sourcePath: file.absolutePath,
          destPath,
          format,
          quality,
          scaleFilters
        }, (proc) => { currentProcess = proc; });

        const newStats = fs.statSync(destPath);
        totalFrameBytes += newStats.size;
        processedCount++;

        sendEvent({
          type: 'progress',
          index: i + 1,
          total: files.length,
          file: destRelPath,
          originalSize: file.size,
          newSize: newStats.size,
          savedBytes: file.size - newStats.size,
          savedPercent: file.size > 0 ? (((file.size - newStats.size) / file.size) * 100).toFixed(1) : 0
        });
      } catch (frameErr) {
        console.error(`Erro ao extrair frame de ${file.relativePath}:`, frameErr);
        errorCount++;
        sendEvent({
          type: 'file_error',
          index: i + 1,
          total: files.length,
          file: file.relativePath,
          error: frameErr.message
        });
      }
    }

    if (!isCancelled) {
      sendEvent({
        type: 'done',
        summary: {
          total: files.length,
          processed: processedCount,
          errors: errorCount,
          totalOriginalBytes,
          totalCompactBytes: totalFrameBytes,
          totalSavedBytes: totalOriginalBytes - totalFrameBytes,
          totalSavedPercent: totalOriginalBytes > 0
            ? (((totalOriginalBytes - totalFrameBytes) / totalOriginalBytes) * 100).toFixed(1)
            : 0
        },
        outputDir: 'frames/'
      });
      res.end();
    }
  } catch (err) {
    console.error('Erro geral na extração de frames:', err);
    sendEvent({ type: 'fatal_error', error: err.message });
    res.end();
  }
});

function startServer(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    const actualPort = server.address().port;
    console.log(`\n======================================================`);
    console.log(`🚀 Compactador de Imagens & Vídeos iniciado!`);
    console.log(`👉 Acesse no navegador: http://localhost:${actualPort}`);
    console.log(`📂 Pasta Origens: ${ORIGENS_DIR}`);
    console.log(`📂 Pasta Compact: ${COMPACT_DIR}`);
    console.log(`📂 Pasta Frames: ${FRAMES_DIR}`);
    console.log(`🎬 Suporte a Vídeo: FFmpeg integrado`);
    console.log(`======================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Porta ${port} já está em uso. Tentando a próxima porta (${port + 1})...`);
      startServer(port + 1);
    } else {
      console.error('Erro no servidor:', err);
    }
  });
}

function ensureWorkDirs() {
  for (const dir of [ORIGENS_DIR, COMPACT_DIR, FRAMES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

const INITIAL_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
ensureWorkDirs();
startServer(INITIAL_PORT);
