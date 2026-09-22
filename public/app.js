// Utilitário para formatar bytes em formato legível (KB, MB, GB)
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Elementos do DOM
const tabBtnImages = document.getElementById('tabBtnImages');
const tabBtnVideos = document.getElementById('tabBtnVideos');
const tabBtnFrames = document.getElementById('tabBtnFrames');
const imageForm = document.getElementById('imageForm');
const videoForm = document.getElementById('videoForm');
const frameForm = document.getElementById('frameForm');
const configCardTitle = document.getElementById('configCardTitle');

const badgeImgCount = document.getElementById('badgeImgCount');
const badgeVideoCount = document.getElementById('badgeVideoCount');
const badgeFrameCount = document.getElementById('badgeFrameCount');
const totalScanCountEl = document.getElementById('totalScanCount');
const totalScanSizeEl = document.getElementById('totalScanSize');
const btnRefreshScan = document.getElementById('btnRefreshScan');

// Controles de Imagem
const imgQualitySlider = document.getElementById('imgQuality');
const imgQualityValEl = document.getElementById('imgQualityVal');
const btnStartImg = document.getElementById('btnStartImg');

// Controles de Vídeo
const videoCrfSlider = document.getElementById('videoCrf');
const videoCrfValEl = document.getElementById('videoCrfVal');
const btnStartVideo = document.getElementById('btnStartVideo');

// Controles de Extração de Frame
const frameSourceSelect = document.getElementById('frameSource');
const frameQualitySlider = document.getElementById('frameQuality');
const frameQualityValEl = document.getElementById('frameQualityVal');
const btnStartFrame = document.getElementById('btnStartFrame');

// Painel de Status & Progresso
const statusBadge = document.getElementById('statusBadge');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const progressBar = document.getElementById('progressBar');
const currentFileText = document.getElementById('currentFileText');

const statProcessed = document.getElementById('statProcessed');
const statOriginalSize = document.getElementById('statOriginalSize');
const statCompactSize = document.getElementById('statCompactSize');
const statSavings = document.getElementById('statSavings');

const logContainer = document.getElementById('logContainer');
const logCount = document.getElementById('logCount');

let currentTab = 'images';
let eventSource = null;
let processedItemCount = 0;
let accumulatedOrigBytes = 0;
let accumulatedCompBytes = 0;
let scanData = {
  images: { count: 0, totalBytes: 0 },
  videos: { count: 0, totalBytes: 0 },
  compactVideos: { count: 0, totalBytes: 0 }
};

const TABS = {
  images: { btn: tabBtnImages, form: imageForm, title: 'Parâmetros para Imagens' },
  videos: { btn: tabBtnVideos, form: videoForm, title: 'Parâmetros para Vídeos' },
  frames: { btn: tabBtnFrames, form: frameForm, title: 'Parâmetros para Extração de Frame' }
};

// Gerenciamento de Abas
function switchTab(tab) {
  currentTab = tab;
  for (const [name, refs] of Object.entries(TABS)) {
    refs.btn.classList.toggle('active', name === tab);
    refs.form.classList.toggle('active', name === tab);
  }
  configCardTitle.textContent = TABS[tab].title;
  updateSummaryDisplay();
}

for (const [name, refs] of Object.entries(TABS)) {
  refs.btn.addEventListener('click', () => switchTab(name));
}

// Sliders
imgQualitySlider.addEventListener('input', (e) => {
  imgQualityValEl.textContent = `${e.target.value}%`;
});

videoCrfSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  let desc = 'Equilibrado';
  if (val <= 20) desc = 'Máxima Qualidade';
  else if (val <= 23) desc = 'Alta Qualidade';
  else if (val >= 28) desc = 'Menor Tamanho';
  videoCrfValEl.textContent = `CRF ${val} (${desc})`;
});

frameQualitySlider.addEventListener('input', (e) => {
  frameQualityValEl.textContent = `${e.target.value}%`;
});

frameSourceSelect.addEventListener('change', () => {
  badgeFrameCount.textContent = frameSourceData().count;
  updateSummaryDisplay();
  updateStartButtons();
});

function frameSourceData() {
  return frameSourceSelect.value === 'origens' ? scanData.videos : scanData.compactVideos;
}

function updateSummaryDisplay() {
  if (currentTab === 'images') {
    totalScanCountEl.textContent = `${scanData.images.count} imagem(ns)`;
    totalScanSizeEl.textContent = formatBytes(scanData.images.totalBytes);
  } else if (currentTab === 'videos') {
    totalScanCountEl.textContent = `${scanData.videos.count} vídeo(s)`;
    totalScanSizeEl.textContent = formatBytes(scanData.videos.totalBytes);
  } else {
    const source = frameSourceData();
    totalScanCountEl.textContent = `${source.count} vídeo(s) em ${frameSourceSelect.value}/`;
    totalScanSizeEl.textContent = formatBytes(source.totalBytes);
  }
}

function updateStartButtons() {
  btnStartImg.disabled = scanData.images.count === 0;
  btnStartVideo.disabled = scanData.videos.count === 0;
  btnStartFrame.disabled = frameSourceData().count === 0;
}

// Varredura da pasta origens
async function scanFolder() {
  try {
    totalScanCountEl.textContent = 'Verificando...';
    const res = await fetch('/api/scan');
    const data = await res.json();
    if (data.success) {
      scanData = {
        images: data.images || { count: data.count || 0, totalBytes: data.totalBytes || 0 },
        videos: data.videos || { count: 0, totalBytes: 0 },
        compactVideos: data.compactVideos || { count: 0, totalBytes: 0 }
      };
      badgeImgCount.textContent = scanData.images.count;
      badgeVideoCount.textContent = scanData.videos.count;
      badgeFrameCount.textContent = frameSourceData().count;
      updateSummaryDisplay();
      updateStartButtons();
    } else {
      totalScanCountEl.textContent = 'Erro ao ler pasta';
    }
  } catch (err) {
    console.error('Erro na varredura:', err);
    totalScanCountEl.textContent = 'Erro de conexão';
  }
}

btnRefreshScan.addEventListener('click', (e) => {
  e.preventDefault();
  scanFolder();
});

// Adicionar item ao log visual
function addLogItem(file, origSize, compSize, savedPct, isError = false, errorMsg = '') {
  const emptyEl = logContainer.querySelector('.empty-log');
  if (emptyEl) {
    emptyEl.remove();
  }

  const item = document.createElement('div');
  item.className = 'log-item';

  if (isError) {
    item.innerHTML = `
      <div class="log-file" title="${file}">${file}</div>
      <div class="log-badge badge-error">Erro: ${errorMsg}</div>
    `;
  } else {
    item.innerHTML = `
      <div class="log-file" title="${file}">${file}</div>
      <div class="log-sizes">
        <span class="before">${formatBytes(origSize)}</span>
        <span class="arrow">➔</span>
        <span class="after">${formatBytes(compSize)}</span>
      </div>
      <div class="log-badge badge-saved">-${savedPct}%</div>
    `;
  }

  logContainer.insertBefore(item, logContainer.firstChild);
  logCount.textContent = `${processedItemCount} itens`;
}

function resetProgressUI(title) {
  if (eventSource) {
    eventSource.close();
  }

  processedItemCount = 0;
  accumulatedOrigBytes = 0;
  accumulatedCompBytes = 0;
  logContainer.innerHTML = '';
  logCount.textContent = '0 itens';

  statusBadge.className = 'status-pill status-running';
  statusBadge.textContent = 'Processando...';

  btnStartImg.disabled = true;
  btnStartVideo.disabled = true;
  btnStartFrame.disabled = true;

  statProcessed.textContent = '0';
  statOriginalSize.textContent = '0 MB';
  statCompactSize.textContent = '0 MB';
  statSavings.textContent = '0%';

  progressBar.style.width = '0%';
  progressPercent.textContent = '0%';
  progressText.textContent = 'Iniciando conexão...';
  currentFileText.textContent = title;
}

function handleSSE(url, activeButton) {
  eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'start') {
      const labels = { video: 'vídeos', frame: 'vídeos', image: 'imagens' };
      const typeLabel = labels[data.mediaType] || 'imagens';
      progressText.textContent = `0 / ${data.total} ${typeLabel}`;
      currentFileText.textContent = `Iniciando processamento de ${data.total} ${typeLabel}...`;
    } else if (data.type === 'video_encoding_start') {
      currentFileText.textContent = `Codificando vídeo [${data.index}/${data.total}]: ${data.file}...`;
    } else if (data.type === 'frame_extract_start') {
      currentFileText.textContent = `Extraindo primeiro frame [${data.index}/${data.total}]: ${data.file}...`;
    } else if (data.type === 'progress') {
      processedItemCount++;
      accumulatedOrigBytes += data.originalSize;
      accumulatedCompBytes += data.newSize;

      const pct = Math.round((data.index / data.total) * 100);
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
      progressText.textContent = `${data.index} / ${data.total} itens`;
      currentFileText.textContent = `Concluído: ${data.file}`;

      statProcessed.textContent = processedItemCount;
      statOriginalSize.textContent = formatBytes(accumulatedOrigBytes);
      statCompactSize.textContent = formatBytes(accumulatedCompBytes);

      if (accumulatedOrigBytes > 0) {
        const totalSavedPct = (((accumulatedOrigBytes - accumulatedCompBytes) / accumulatedOrigBytes) * 100).toFixed(1);
        statSavings.textContent = `${totalSavedPct}%`;
      }

      addLogItem(data.file, data.originalSize, data.newSize, data.savedPercent);
    } else if (data.type === 'file_error') {
      processedItemCount++;
      addLogItem(data.file, 0, 0, 0, true, data.error);
    } else if (data.type === 'done') {
      eventSource.close();
      eventSource = null;

      statusBadge.className = 'status-pill status-done';
      statusBadge.textContent = 'Concluído!';

      const outputDir = data.outputDir || 'compact/';
      currentFileText.textContent = `Sucesso! Todos os arquivos foram salvos na pasta ${outputDir}`;
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';

      if (data.summary) {
        statProcessed.textContent = data.summary.processed;
        statOriginalSize.textContent = formatBytes(data.summary.totalOriginalBytes);
        statCompactSize.textContent = formatBytes(data.summary.totalCompactBytes);
        statSavings.textContent = `${data.summary.totalSavedPercent}%`;
      }

      // Revarre as pastas: a compactação alimenta a aba de frames
      scanFolder();
    } else if (data.type === 'empty') {
      eventSource.close();
      eventSource = null;
      statusBadge.className = 'status-pill status-idle';
      statusBadge.textContent = 'Pasta vazia';
      updateStartButtons();
      currentFileText.textContent = data.message;
    } else if (data.type === 'fatal_error') {
      eventSource.close();
      eventSource = null;
      statusBadge.className = 'status-pill badge-error';
      statusBadge.textContent = 'Erro fatal';
      updateStartButtons();
      currentFileText.textContent = `Erro: ${data.error}`;
    }
  };

  eventSource.onerror = (err) => {
    console.error('Erro na conexão SSE:', err);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    updateStartButtons();
    statusBadge.className = 'status-pill badge-error';
    statusBadge.textContent = 'Erro de Conexão';
    currentFileText.textContent = 'Conexão interrompida. Verifique o servidor local.';
  };
}

// Submissão do Formulário de Imagens
imageForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const maxWidth = document.getElementById('imgMaxWidth').value.trim();
  const maxHeight = document.getElementById('imgMaxHeight').value.trim();
  const quality = imgQualitySlider.value;

  const queryParams = new URLSearchParams();
  if (maxWidth) queryParams.append('maxWidth', maxWidth);
  if (maxHeight) queryParams.append('maxHeight', maxHeight);
  queryParams.append('quality', quality);

  resetProgressUI('Preparando lote de imagens...');
  handleSSE(`/api/process-images?${queryParams.toString()}`, btnStartImg);
});

// Submissão do Formulário de Vídeos
videoForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const codec = document.getElementById('videoCodec').value;
  const removeAudio = document.getElementById('removeAudio').checked;
  const crf = videoCrfSlider.value;
  const maxWidth = document.getElementById('videoMaxWidth').value.trim();
  const maxHeight = document.getElementById('videoMaxHeight').value.trim();

  const queryParams = new URLSearchParams();
  queryParams.append('codec', codec);
  queryParams.append('removeAudio', removeAudio ? 'true' : 'false');
  queryParams.append('crf', crf);
  if (maxWidth) queryParams.append('maxWidth', maxWidth);
  if (maxHeight) queryParams.append('maxHeight', maxHeight);

  resetProgressUI('Iniciando conversão e compressão de vídeos via FFmpeg...');
  handleSSE(`/api/process-videos?${queryParams.toString()}`, btnStartVideo);
});

// Submissão do Formulário de Extração de Primeiro Frame
frameForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const source = frameSourceSelect.value;
  const format = document.getElementById('frameFormat').value;
  const quality = frameQualitySlider.value;
  const maxWidth = document.getElementById('frameMaxWidth').value.trim();
  const maxHeight = document.getElementById('frameMaxHeight').value.trim();

  const queryParams = new URLSearchParams();
  queryParams.append('source', source);
  queryParams.append('format', format);
  queryParams.append('quality', quality);
  if (maxWidth) queryParams.append('maxWidth', maxWidth);
  if (maxHeight) queryParams.append('maxHeight', maxHeight);

  resetProgressUI(`Extraindo o primeiro frame dos vídeos em ${source}/...`);
  handleSSE(`/api/extract-frames?${queryParams.toString()}`, btnStartFrame);
});

// Inicialização
scanFolder();
