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
const imageForm = document.getElementById('imageForm');
const videoForm = document.getElementById('videoForm');
const configCardTitle = document.getElementById('configCardTitle');

const badgeImgCount = document.getElementById('badgeImgCount');
const badgeVideoCount = document.getElementById('badgeVideoCount');
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
let scanData = { images: { count: 0, totalBytes: 0 }, videos: { count: 0, totalBytes: 0 } };

// Gerenciamento de Abas
function switchTab(tab) {
  currentTab = tab;
  if (tab === 'images') {
    tabBtnImages.classList.add('active');
    tabBtnVideos.classList.remove('active');
    imageForm.classList.add('active');
    videoForm.classList.remove('active');
    configCardTitle.textContent = 'Parâmetros para Imagens';
    updateSummaryDisplay();
  } else {
    tabBtnVideos.classList.add('active');
    tabBtnImages.classList.remove('active');
    videoForm.classList.add('active');
    imageForm.classList.remove('active');
    configCardTitle.textContent = 'Parâmetros para Vídeos';
    updateSummaryDisplay();
  }
}

tabBtnImages.addEventListener('click', () => switchTab('images'));
tabBtnVideos.addEventListener('click', () => switchTab('videos'));

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

function updateSummaryDisplay() {
  if (currentTab === 'images') {
    totalScanCountEl.textContent = `${scanData.images.count} imagem(ns)`;
    totalScanSizeEl.textContent = formatBytes(scanData.images.totalBytes);
  } else {
    totalScanCountEl.textContent = `${scanData.videos.count} vídeo(s)`;
    totalScanSizeEl.textContent = formatBytes(scanData.videos.totalBytes);
  }
}

// Varredura da pasta origens
async function scanFolder() {
  try {
    totalScanCountEl.textContent = 'Verificando...';
    const res = await fetch('/api/scan');
    const data = await res.json();
    if (data.success) {
      scanData = data;
      badgeImgCount.textContent = data.images ? data.images.count : data.count;
      badgeVideoCount.textContent = data.videos ? data.videos.count : 0;
      updateSummaryDisplay();

      btnStartImg.disabled = (data.images && data.images.count === 0);
      btnStartVideo.disabled = (data.videos && data.videos.count === 0);
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
      const typeLabel = data.mediaType === 'video' ? 'vídeos' : 'imagens';
      progressText.textContent = `0 / ${data.total} ${typeLabel}`;
      currentFileText.textContent = `Iniciando processamento de ${data.total} ${typeLabel}...`;
    } else if (data.type === 'video_encoding_start') {
      currentFileText.textContent = `Codificando vídeo [${data.index}/${data.total}]: ${data.file}...`;
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
      btnStartImg.disabled = false;
      btnStartVideo.disabled = false;

      currentFileText.textContent = `Sucesso! Todos os arquivos foram salvos na pasta compact/`;
      progressBar.style.width = '100%';
      progressPercent.textContent = '100%';

      if (data.summary) {
        statProcessed.textContent = data.summary.processed;
        statOriginalSize.textContent = formatBytes(data.summary.totalOriginalBytes);
        statCompactSize.textContent = formatBytes(data.summary.totalCompactBytes);
        statSavings.textContent = `${data.summary.totalSavedPercent}%`;
      }
    } else if (data.type === 'empty') {
      eventSource.close();
      eventSource = null;
      statusBadge.className = 'status-pill status-idle';
      statusBadge.textContent = 'Pasta vazia';
      btnStartImg.disabled = false;
      btnStartVideo.disabled = false;
      currentFileText.textContent = data.message;
    } else if (data.type === 'fatal_error') {
      eventSource.close();
      eventSource = null;
      statusBadge.className = 'status-pill badge-error';
      statusBadge.textContent = 'Erro fatal';
      btnStartImg.disabled = false;
      btnStartVideo.disabled = false;
      currentFileText.textContent = `Erro: ${data.error}`;
    }
  };

  eventSource.onerror = (err) => {
    console.error('Erro na conexão SSE:', err);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    btnStartImg.disabled = false;
    btnStartVideo.disabled = false;
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

// Inicialização
scanFolder();
