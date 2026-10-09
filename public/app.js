import { transitionsRegistry } from './transitions/index.js';

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
const wipeOptionsContainer = document.querySelector('#wipeOptions');

// Preset Elements
const presetPicker = document.querySelector('#presetPicker');
const presetThumb = document.querySelector('#presetThumb');
const presetTitle = document.querySelector('#presetTitle');
const presetSubtitle = document.querySelector('#presetSubtitle');
const presetDialog = document.querySelector('#presetDialog');
const presetClose = document.querySelector('#presetClose');
const presetGrid = document.querySelector('#presetGrid');
const presetStatus = document.querySelector('#presetStatus');

const DEFAULT_THUMB = 'thumbnails/defthumb.jpeg';

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
let loadedPresets = [];
let activePresetId = null;

// Dynamic Transition UI Setup
function renderTransitionOptions() {
  wipeOptionsContainer.replaceChildren();

  transitionsRegistry.forEach((transition, id) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'wipeType';
    input.value = id;
    if (id === wipeType) input.checked = true;

    input.addEventListener('change', () => {
      wipeType = id;
      syncOriginPicker();
    });

    const span = document.createElement('span');
    span.innerHTML = `${transition.iconSvg} ${transition.name}`;

    label.append(input, span);
    wipeOptionsContainer.append(label);
  });
}

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

function clearMask(layer) {
  layer.style.maskImage = 'none';
  layer.style.webkitMaskImage = 'none';
}

function applyMask(layer, gradient) {
  layer.style.maskImage = gradient;
  layer.style.webkitMaskImage = gradient;
}

function renderProgress(progress) {
  imageOne.style.zIndex = '1';
  imageOne.style.opacity = '1';
  clearMask(imageOne);
  imageTwo.style.zIndex = '2';

  if (progress <= 0) {
    imageTwo.style.opacity = '0';
    clearMask(imageTwo);
    return;
  }
  if (progress >= 1) {
    imageTwo.style.opacity = '1';
    clearMask(imageTwo);
    return;
  }

  const transition = transitionsRegistry.get(wipeType) || transitionsRegistry.get('circle');
  const point = canvasOrigin('cover');
  const width = timerCanvas.clientWidth;
  const height = timerCanvas.clientHeight;

  const options = {
    width,
    height,
    direction,
    feather: maskFeather,
    cx: point.x,
    cy: point.y,
  };

  const result = transition.render(progress, options);

  imageTwo.style.opacity = result.opacityTwo !== undefined ? result.opacityTwo : '1';
  if (result.opacityOne !== undefined) imageOne.style.opacity = result.opacityOne;

  if (result.maskTwo) {
    applyMask(imageTwo, result.maskTwo);
  } else {
    clearMask(imageTwo);
  }

  if (result.maskOne) {
    applyMask(imageOne, result.maskOne);
  } else {
    clearMask(imageOne);
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
  const currentType = form.elements.wipeType ? form.elements.wipeType.value : 'circle';
  const transition = transitionsRegistry.get(currentType);
  originPicker.hidden = !(transition && transition.supportsOrigin);
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

// --- Image Handling & Gallery Dialog ---
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

// --- Presets System with Thumbnail Support ---
async function fetchPresets() {
  try {
    const response = await fetch('presets.json', { cache: 'no-cache' });
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.error('Failed to parse presets.json:', err);
    return [];
  }
}

function applyPreset(preset) {
  if (!preset) return;

  activePresetId = preset.id;
  presetTitle.textContent = preset.name;
  presetSubtitle.textContent = `${preset.duration} min duration`;

  const thumbUrl = preset.thumbnail || DEFAULT_THUMB;
  presetThumb.style.backgroundImage = `url("${thumbUrl}")`;

  if (preset.imageOne) {
    applyImage(slots.one, imageUrl(preset.imageOne), displayName(preset.imageOne), preset.imageOne);
  }
  if (preset.imageTwo) {
    applyImage(slots.two, imageUrl(preset.imageTwo), displayName(preset.imageTwo), preset.imageTwo);
  }
  if (preset.duration !== undefined) {
    document.querySelector('#duration').value = preset.duration;
  }
  if (preset.feather !== undefined) {
    featherAmount.value = preset.feather;
  }
  if (preset.wipeType && transitionsRegistry.has(preset.wipeType)) {
    const radio = form.querySelector(`input[name="wipeType"][value="${preset.wipeType}"]`);
    if (radio) {
      radio.checked = true;
      wipeType = preset.wipeType;
    }
  }
  if (preset.direction) {
    const radio = form.querySelector(`input[name="direction"][value="${preset.direction}"]`);
    if (radio) radio.checked = true;
  }
  if (preset.origin) {
    updateOrigin(preset.origin.x, preset.origin.y);
  }

  syncOriginPicker();
}

function renderPresetDialog() {
  presetGrid.replaceChildren();

  if (!loadedPresets.length) {
    presetStatus.textContent = 'No presets are available.';
    presetStatus.hidden = false;
    return;
  }

  presetStatus.hidden = true;
  loadedPresets.forEach((preset) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'gallery-item';
    item.setAttribute('aria-pressed', String(activePresetId === preset.id));

    const picture = document.createElement('img');
    const thumbPath = preset.thumbnail || DEFAULT_THUMB;
    picture.src = thumbPath;
    picture.alt = preset.name;
    picture.loading = 'lazy';

    // Fallback if the specified thumbnail file fails to load
    picture.addEventListener('error', () => {
      picture.src = DEFAULT_THUMB;
    });

    const caption = document.createElement('span');
    caption.textContent = preset.name;

    item.append(picture, caption);
    item.addEventListener('click', () => {
      applyPreset(preset);
      presetDialog.close();
    });
    presetGrid.append(item);
  });
}

async function initPresets() {
  loadedPresets = await fetchPresets();
  presetPicker.addEventListener('click', () => {
    renderPresetDialog();
    presetDialog.showModal();
  });
}

// --- App Initialization ---
renderTransitionOptions();
initPresets();

Object.values(slots).forEach((slot) => {
  slot.button.addEventListener('click', () => openGallery(slot));
});
galleryClose.addEventListener('click', () => galleryDialog.close());
galleryDialog.addEventListener('click', (event) => {
  if (event.target === galleryDialog) galleryDialog.close();
});
presetClose.addEventListener('click', () => presetDialog.close());
presetDialog.addEventListener('click', (event) => {
  if (event.target === presetDialog) presetDialog.close();
});
galleryUpload.addEventListener('change', uploadImage);

const DEFAULT_IMAGES = { one: 'Default1.jpeg', two: 'Default2.jpeg' };
Object.entries(DEFAULT_IMAGES).forEach(([key, file]) => {
  applyImage(slots[key], imageUrl(file), displayName(file), file);
});

form.addEventListener('submit', startTimer);
originPicker.addEventListener('click', chooseOrigin);
originPicker.addEventListener('keydown', moveOrigin);
wipeOptionsContainer.addEventListener('change', syncOriginPicker);
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
