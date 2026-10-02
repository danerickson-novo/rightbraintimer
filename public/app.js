const form = document.querySelector('#timerForm');
const timerCard = document.querySelector('.timer-card');
const timerCanvas = document.querySelector('#timerCanvas');
const imageOne = document.querySelector('#imageOne');
const imageTwo = document.querySelector('#imageTwo');
const originPicker = document.querySelector('#originPicker');
const originMarker = document.querySelector('#originMarker');
const timerOverlay = document.querySelector('#timerOverlay');
const pauseButton = document.querySelector('#pauseButton');
const fullscreenButton = document.querySelector('#fullscreenButton');
const resetButton = document.querySelector('#resetButton');
const timerState = document.querySelector('#timerState');
const featherAmount = document.querySelector('#featherAmount');
const wipeTypeInputs = document.querySelectorAll('input[name="wipeType"]');

let animationFrame;
let startedAt = 0;
let pausedAt = 0;
let pausedDuration = 0;
let durationMs = 0;
let wipeType = 'circle';
let direction = 'forward';
let isPaused = false;
let maskFeather = 60;
let origin = { x: 0.5, y: 0.5 };
let sourceSize;

function imageBounds(fit) {
  const width = timerCanvas.clientWidth;
  const height = timerCanvas.clientHeight;
  if (!sourceSize) return { left: 0, top: 0, width, height };

  const horizontalScale = width / sourceSize.width;
  const verticalScale = height / sourceSize.height;
  const scale = fit === 'contain'
    ? Math.min(horizontalScale, verticalScale)
    : Math.max(horizontalScale, verticalScale);
  const fittedWidth = sourceSize.width * scale;
  const fittedHeight = sourceSize.height * scale;

  return {
    left: (width - fittedWidth) / 2,
    top: (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

function canvasOrigin(fit) {
  const bounds = imageBounds(fit);
  return {
    x: bounds.left + bounds.width * origin.x,
    y: bounds.top + bounds.height * origin.y,
  };
}

function maxRadius(point) {
  const width = timerCanvas.clientWidth;
  const height = timerCanvas.clientHeight;
  const farthestCorner = Math.max(
    Math.hypot(point.x, point.y),
    Math.hypot(width - point.x, point.y),
    Math.hypot(point.x, height - point.y),
    Math.hypot(width - point.x, height - point.y),
  );

  return farthestCorner + maskFeather / 2 + 1;
}

function clearMask(layer) {
  layer.style.maskImage = 'none';
  layer.style.webkitMaskImage = 'none';
}

function applyMask(layer, gradient) {
  layer.style.maskImage = gradient;
  layer.style.webkitMaskImage = gradient;
}

function circleMask(progress) {
  const point = canvasOrigin('cover');
  const maxDist = maxRadius(point);
  
  // Start -feather/2 so progress 0 is fully invisible.
  // End maxDist + feather/2 so progress 1 fully covers the canvas without popping.
  const minRadius = -maskFeather / 2;
  const maxRadiusBuffered = maxDist + maskFeather / 2;
  
  const currentRadius = minRadius + (maxRadiusBuffered - minRadius) * (direction === 'forward' ? progress : 1 - progress);

  const innerRadius = Math.max(0, currentRadius - maskFeather / 2);
  const outerRadius = Math.max(0, currentRadius + maskFeather / 2);

  if (direction === 'forward') {
    return `radial-gradient(circle at ${point.x}px ${point.y}px, #000 ${innerRadius}px, transparent ${outerRadius}px)`;
  }

  return `radial-gradient(circle at ${point.x}px ${point.y}px, transparent ${innerRadius}px, #000 ${outerRadius}px)`;
}

function linearMask(progress, axis) {
  const length = axis === 'horizontal' ? timerCanvas.clientWidth : timerCanvas.clientHeight;
  
  // Buffer both start (-feather/2) and end (length + feather/2)
  const startEdge = -maskFeather / 2;
  const endEdge = length + maskFeather / 2 + 1;
  const edge = startEdge + (endEdge - startEdge) * progress;

  const innerEdge = Math.max(0, edge - maskFeather / 2);
  const outerEdge = Math.max(0, edge + maskFeather / 2);

  const gradientDirection = axis === 'horizontal'
    ? direction === 'forward' ? 'to right' : 'to left'
    : direction === 'forward' ? 'to bottom' : 'to top';

  return `linear-gradient(${gradientDirection}, #000 ${innerEdge}px, transparent ${outerEdge}px)`;
}

function centerMask(progress) {
  const center = timerCanvas.clientHeight / 2;
  
  // Buffer max extent by full feather so the band completely clears top and bottom edges
  const maxExtent = center + maskFeather + 1;
  const activeProgress = direction === 'forward' ? progress : 1 - progress;
  
  const extent = maxExtent * activeProgress;

  const topOuter = center - extent - maskFeather / 2;
  const topInner = Math.min(center, center - extent + maskFeather / 2);
  const bottomInner = Math.max(center, center + extent - maskFeather / 2);
  const bottomOuter = center + extent + maskFeather / 2;

  if (direction === 'forward') {
    return `linear-gradient(to bottom, transparent ${topOuter}px, #000 ${topInner}px, #000 ${bottomInner}px, transparent ${bottomOuter}px)`;
  }

  return `linear-gradient(to bottom, #000 ${topOuter}px, transparent ${topInner}px, transparent ${bottomInner}px, #000 ${bottomOuter}px)`;
}

function maskForProgress(progress) {
  if (wipeType === 'horizontal') return linearMask(progress, 'horizontal');
  if (wipeType === 'vertical') return linearMask(progress, 'vertical');
  if (wipeType === 'center') return centerMask(progress);
  return circleMask(progress);
}

function renderProgress(progress) {
  imageOne.style.zIndex = '1';
  imageOne.style.opacity = '1';
  clearMask(imageOne);
  imageTwo.style.zIndex = '2';

  if (progress <= 0) {
    imageTwo.style.opacity = '0';
    clearMask(imageTwo);
  } else if (progress >= 1) {
    imageTwo.style.opacity = '1';
    clearMask(imageTwo);
  } else {
    imageTwo.style.opacity = '1';
    applyMask(imageTwo, maskForProgress(progress));
  }
}

function completeTimer() {
  renderProgress(1);
  timerCanvas.classList.remove('finish-bump');
  void timerCanvas.offsetWidth;
  timerCanvas.classList.add('finish-bump');
  timerState.textContent = 'Transition complete';
  pauseButton.hidden = true;
  resetButton.textContent = 'Set another timer';
  timerCanvas.setAttribute('aria-label', 'Timer complete, showing the finishing image');
}

function tick(now) {
  if (isPaused) return;

  const elapsed = now - startedAt - pausedDuration;
  const progress = Math.min(elapsed / durationMs, 1);
  renderProgress(progress);

  if (progress < 1) {
    animationFrame = requestAnimationFrame(tick);
  } else {
    completeTimer();
  }
}

function startTimer(event) {
  event.preventDefault();
  const duration = Number(document.querySelector('#duration').value);
  const feather = Number(featherAmount.value);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(feather) || feather < 0) {
    return;
  }

  durationMs = duration * 60 * 1000;
  maskFeather = feather;
  wipeType = form.elements.wipeType.value;
  direction = form.elements.direction.value;
  startedAt = performance.now();
  pausedDuration = 0;
  isPaused = false;

  timerCard.classList.add('is-running');
  timerCard.classList.remove('is-paused');
  timerCanvas.classList.remove('finish-bump');
  timerOverlay.hidden = false;
  pauseButton.hidden = false;
  pauseButton.querySelector('.sr-only').textContent = 'Pause timer';
  resetButton.textContent = 'End timer';
  timerState.textContent = 'In progress';
  timerCanvas.setAttribute('aria-label', 'Visual timer in progress');
  renderProgress(0);
  animationFrame = requestAnimationFrame(tick);
}

function togglePause() {
  if (isPaused) {
    pausedDuration += performance.now() - pausedAt;
    isPaused = false;
    timerCard.classList.remove('is-paused');
    timerState.textContent = 'In progress';
    pauseButton.querySelector('.sr-only').textContent = 'Pause timer';
    animationFrame = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(animationFrame);
    pausedAt = performance.now();
    isPaused = true;
    timerCard.classList.add('is-paused');
    timerState.textContent = 'Paused';
    pauseButton.querySelector('.sr-only').textContent = 'Resume timer';
  }
}

function resetTimer() {
  cancelAnimationFrame(animationFrame);
  timerCard.classList.remove('is-running', 'is-paused');
  timerCanvas.classList.remove('finish-bump');
  timerOverlay.hidden = true;
  imageOne.style.zIndex = '1';
  imageOne.style.opacity = '1';
  clearMask(imageOne);
  imageTwo.style.zIndex = '2';
  imageTwo.style.opacity = '0';
  clearMask(imageTwo);
  if (document.fullscreenElement === timerCard) document.exitFullscreen();
  timerCanvas.setAttribute('aria-label', 'Timer preview, showing the starting image');
  requestAnimationFrame(positionOriginMarker);
}

function describeOrigin() {
  const vertical = origin.y < 0.34 ? 'top' : origin.y > 0.66 ? 'bottom' : 'middle';
  const horizontal = origin.x < 0.34 ? 'left' : origin.x > 0.66 ? 'right' : 'center';
  return `${vertical} ${horizontal}`;
}

function updateOrigin(x, y) {
  origin = {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
  positionOriginMarker();
  originPicker.setAttribute(
    'aria-label',
    `Choose the transition origin. Current origin is ${describeOrigin()}.`,
  );
}

function positionOriginMarker() {
  const point = canvasOrigin('contain');
  originMarker.style.left = `${point.x}px`;
  originMarker.style.top = `${point.y}px`;
}

function syncOriginPicker() {
  originPicker.hidden = form.elements.wipeType.value !== 'circle';
}

function chooseOrigin(event) {
  if (event.detail === 0) {
    updateOrigin(0.5, 0.5);
    return;
  }

  const pickerBounds = originPicker.getBoundingClientRect();
  const bounds = imageBounds('contain');
  updateOrigin(
    (event.clientX - pickerBounds.left - bounds.left) / bounds.width,
    (event.clientY - pickerBounds.top - bounds.top) / bounds.height,
  );
}

function moveOrigin(event) {
  const directions = {
    ArrowLeft: [-0.05, 0],
    ArrowRight: [0.05, 0],
    ArrowUp: [0, -0.05],
    ArrowDown: [0, 0.05],
  };
  const change = directions[event.key];
  if (!change) return;
  event.preventDefault();
  updateOrigin(origin.x + change[0], origin.y + change[1]);
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement === timerCard) {
      await document.exitFullscreen();
    } else {
      await timerCard.requestFullscreen();
    }
  } catch {
    fullscreenButton.querySelector('.sr-only').textContent = 'Full screen is unavailable';
  }
}

function syncFullscreenState() {
  const isFullscreen = document.fullscreenElement === timerCard;
  timerCard.classList.toggle('is-fullscreen', isFullscreen);
  fullscreenButton.querySelector('.sr-only').textContent = isFullscreen
    ? 'Exit full screen'
    : 'Enter full screen';
}

const IMAGE_DIR = 'images/';
const IMAGE_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

const galleryDialog = document.querySelector('#galleryDialog');
const galleryTitle = document.querySelector('#galleryTitle');
const galleryGrid = document.querySelector('#galleryGrid');
const galleryStatus = document.querySelector('#galleryStatus');
const galleryClose = document.querySelector('#galleryClose');
const galleryUpload = document.querySelector('#galleryUpload');

const slots = {
  one: {
    label: 'starting',
    button: document.querySelector('#pickerOne'),
    layer: imageOne,
    thumb: document.querySelector('#thumbOne'),
    name: document.querySelector('#fileOneName'),
    file: null,
    onDimensions(width, height) {
      sourceSize = { width, height };
      positionOriginMarker();
    },
  },
  two: {
    label: 'finishing',
    button: document.querySelector('#pickerTwo'),
    layer: imageTwo,
    thumb: document.querySelector('#thumbTwo'),
    name: document.querySelector('#fileTwoName'),
    file: null,
  },
};

let activeSlot = slots.one;
let galleryFiles;

function displayName(file) {
  return file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
}

function imageUrl(file) {
  return `${IMAGE_DIR}${encodeURIComponent(file)}`;
}

async function fetchManifest() {
  const response = await fetch(`${IMAGE_DIR}manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error('No manifest');
  const list = await response.json();
  if (!Array.isArray(list)) throw new Error('Invalid manifest');
  return list;
}

// Fallback for servers that expose a directory listing (e.g. `python3 -m http.server`).
async function fetchDirectoryListing() {
  const response = await fetch(IMAGE_DIR);
  if (!response.ok) throw new Error('No directory listing');
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  return [...doc.querySelectorAll('a[href]')].map((link) => {
    const path = link.getAttribute('href').split(/[?#]/)[0];
    return decodeURIComponent(path.split('/').pop());
  });
}

async function loadGalleryFiles() {
  if (galleryFiles) return galleryFiles;

  let list = [];
  try {
    list = await fetchManifest();
  } catch {
    try {
      list = await fetchDirectoryListing();
    } catch {
      list = [];
    }
  }

  const files = [...new Set(list.filter((file) => typeof file === 'string' && IMAGE_PATTERN.test(file)))];
  if (files.length) galleryFiles = files;
  return files;
}

function renderGallery(files) {
  galleryGrid.replaceChildren();

  if (!files.length) {
    galleryStatus.textContent = 'No images are available here yet. You can select one from your computer.';
    galleryStatus.hidden = false;
    return;
  }

  galleryStatus.hidden = true;
  files.forEach((file) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'gallery-item';
    item.setAttribute('aria-pressed', String(activeSlot.file === file));

    const picture = document.createElement('img');
    picture.src = imageUrl(file);
    picture.alt = '';
    picture.loading = 'lazy';
    picture.addEventListener('error', () => item.remove());

    const caption = document.createElement('span');
    caption.textContent = displayName(file);

    item.append(picture, caption);
    item.addEventListener('click', () => {
      applyImage(activeSlot, imageUrl(file), displayName(file), file);
      galleryDialog.close();
    });
    galleryGrid.append(item);
  });
}

function applyImage(slot, url, label, file = null) {
  const imageValue = `url("${url}")`;
  slot.layer.style.backgroundImage = imageValue;
  slot.thumb.style.backgroundImage = imageValue;
  slot.name.textContent = label;
  slot.file = file;

  if (slot.onDimensions) {
    const loadedImage = new Image();
    loadedImage.addEventListener('load', () => {
      slot.onDimensions(loadedImage.naturalWidth, loadedImage.naturalHeight);
    });
    loadedImage.src = url;
  }
}

async function openGallery(slot) {
  activeSlot = slot;
  galleryTitle.textContent = `Choose the ${slot.label} image`;
  galleryGrid.replaceChildren();
  galleryStatus.textContent = 'Loading images…';
  galleryStatus.hidden = false;
  galleryDialog.showModal();

  const files = await loadGalleryFiles();
  if (galleryDialog.open && activeSlot === slot) renderGallery(files);
}

function uploadImage() {
  const [file] = galleryUpload.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener('load', () => {
    applyImage(activeSlot, reader.result, file.name);
    galleryDialog.close();
  });
  reader.readAsDataURL(file);
  galleryUpload.value = '';
}

Object.values(slots).forEach((slot) => {
  slot.button.addEventListener('click', () => openGallery(slot));
});
galleryClose.addEventListener('click', () => galleryDialog.close());
galleryDialog.addEventListener('click', (event) => {
  if (event.target === galleryDialog) galleryDialog.close();
});
galleryUpload.addEventListener('change', uploadImage);

form.addEventListener('submit', startTimer);
originPicker.addEventListener('click', chooseOrigin);
originPicker.addEventListener('keydown', moveOrigin);
wipeTypeInputs.forEach((input) => input.addEventListener('change', syncOriginPicker));
pauseButton.addEventListener('click', togglePause);
fullscreenButton.addEventListener('click', toggleFullscreen);
resetButton.addEventListener('click', resetTimer);
document.addEventListener('fullscreenchange', syncFullscreenState);
window.addEventListener('resize', () => {
  if (timerCard.classList.contains('is-running')) {
    const elapsed = isPaused
      ? pausedAt - startedAt - pausedDuration
      : performance.now() - startedAt - pausedDuration;
    renderProgress(Math.min(elapsed / durationMs, 1));
  } else {
    positionOriginMarker();
  }
});
