import { transitionsRegistry } from './transitions/index.js';

// DOM Elements
const form = document.querySelector('#presetForm');
const timerCard = document.querySelector('.timer-card');
const timerCanvas = document.querySelector('#timerCanvas');
const imageOne = document.querySelector('#imageOne');
const imageTwo = document.querySelector('#imageTwo');
const originPicker = document.querySelector('#originPicker');
const originMarker = document.querySelector('#originMarker');
const timerOverlay = document.querySelector('#timerOverlay');
const pauseButton = document.querySelector('#pauseButton');
const editButton = document.querySelector('#editButton');
const featherAmount = document.querySelector('#featherAmount');
const wipeOptionsContainer = document.querySelector('#wipeOptions');
const previewBtn = document.querySelector('#previewBtn');
const saveStatus = document.querySelector('#saveStatus');
const thumbnailCard = document.querySelector('#thumbnailCard');
const thumbnailCanvas = document.querySelector('#thumbnailCanvas');

// Gallery Elements
const galleryDialog = document.querySelector('#galleryDialog');
const galleryTitle = document.querySelector('#galleryTitle');
const galleryGrid = document.querySelector('#galleryGrid');
const galleryStatus = document.querySelector('#galleryStatus');
const galleryClose = document.querySelector('#galleryClose');
const galleryUpload = document.querySelector('#galleryUpload');

const IMAGE_DIR = 'images/';
const IMAGE_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

let animationFrame;
let startedAt = 0;
let pausedAt = 0;
let pausedDuration = 0;
let durationMs = 10 * 60 * 1000;
let wipeType = 'circle';
let direction = 'forward';
let isPaused = false;
let maskFeather = 70;
let origin = { x: 0.5, y: 0.5 };
let sourceSize = null;
let galleryFiles = null;

const slots = {
  one: {
    label: 'starting',
    button: document.querySelector('#pickerOne'),
    layer: imageOne,
    thumb: document.querySelector('#thumbOne'),
    name: document.querySelector('#fileOneName'),
    file: 'Default1.jpeg',
    onDimensions(w, h) {
      sourceSize = { width: w, height: h };
      positionOriginMarker();
    },
  },
  two: {
    label: 'finishing',
    button: document.querySelector('#pickerTwo'),
    layer: imageTwo,
    thumb: document.querySelector('#thumbTwo'),
    name: document.querySelector('#fileTwoName'),
    file: 'Default2.jpeg',
  },
};

let activeSlot = slots.one;

// Dynamic Transition Input Generator
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
      generateThumbnailAt50Percent();
    });

    const span = document.createElement('span');
    span.innerHTML = `${transition.iconSvg} ${transition.name}`;
    label.append(input, span);
    wipeOptionsContainer.append(label);
  });
}

/**
 * Calculates the precise pixel bounds of the image as rendered inside the canvas frame
 */
function imageBounds(fit = 'contain') {
  const width = timerCanvas.clientWidth || 600;
  const height = timerCanvas.clientHeight || 400;

  if (!sourceSize || !sourceSize.width || !sourceSize.height) {
    return { left: 0, top: 0, width, height };
  }

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

/**
 * Converts normalized origin coordinates (0.0 - 1.0) to pixel points on the canvas
 */
function canvasOrigin(fit = 'contain') {
  const bounds = imageBounds(fit);
  return {
    x: bounds.left + bounds.width * origin.x,
    y: bounds.top + bounds.height * origin.y,
  };
}

function positionOriginMarker() {
  const point = canvasOrigin('contain');
  originMarker.style.left = `${point.x}px`;
  originMarker.style.top = `${point.y}px`;
}

function updateOrigin(x, y) {
  origin = {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
  positionOriginMarker();
  generateThumbnailAt50Percent();
}

/**
 * Mouse click listener that maps click location directly to image boundaries
 */
function chooseOrigin(event) {
  if (event.detail === 0) {
    updateOrigin(0.5, 0.5);
    return;
  }

  const pickerBounds = originPicker.getBoundingClientRect();
  const clickX = event.clientX - pickerBounds.left;
  const clickY = event.clientY - pickerBounds.top;

  const bounds = imageBounds('contain');
  if (!bounds.width || !bounds.height) return;

  // Calculate normalized coordinate relative strictly to the displayed image area
  const normalizedX = (clickX - bounds.left) / bounds.width;
  const normalizedY = (clickY - bounds.top) / bounds.height;

  // Clamp values within 0.0 to 1.0 range
  updateOrigin(
    Math.min(1, Math.max(0, normalizedX)),
    Math.min(1, Math.max(0, normalizedY))
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

function syncOriginPicker() {
  const transition = transitionsRegistry.get(wipeType);
  originPicker.hidden = !(transition && transition.supportsOrigin);
}

function renderProgress(progress) {
  imageOne.style.zIndex = '1';
  imageOne.style.opacity = '1';
  imageTwo.style.zIndex = '2';

  if (progress <= 0) {
    imageTwo.style.opacity = '0';
    imageTwo.style.maskImage = 'none';
    return;
  }
  if (progress >= 1) {
    imageTwo.style.opacity = '1';
    imageTwo.style.maskImage = 'none';
    return;
  }

  const transition = transitionsRegistry.get(wipeType) || transitionsRegistry.get('circle');
  const point = canvasOrigin('cover');
  const result = transition.render(progress, {
    width: timerCanvas.clientWidth,
    height: timerCanvas.clientHeight,
    direction,
    feather: maskFeather,
    cx: point.x,
    cy: point.y,
  });

  imageTwo.style.opacity = result.opacityTwo !== undefined ? result.opacityTwo : '1';
  imageTwo.style.maskImage = result.maskTwo || 'none';
  imageTwo.style.webkitMaskImage = result.maskTwo || 'none';
}

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
    galleryStatus.textContent = 'No images available. Select one from your computer.';
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

function applyImage(slot, url, label, file = null) {
  const imageValue = `url("${url}")`;
  slot.layer.style.backgroundImage = imageValue;
  slot.thumb.style.backgroundImage = imageValue;
  slot.name.textContent = label;
  slot.file = file || label;

  const loadedImage = new Image();
  loadedImage.onload = () => {
    if (slot.onDimensions) {
      slot.onDimensions(loadedImage.naturalWidth, loadedImage.naturalHeight);
    }
    generateThumbnailAt50Percent();
  };
  loadedImage.src = url;
}

function uploadImage() {
  const [file] = galleryUpload.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener('load', () => {
    applyImage(activeSlot, reader.result, file.name, file.name);
    galleryDialog.close();
  });
  reader.readAsDataURL(file);
  galleryUpload.value = '';
}

function startPreview() {
  readFormValues();
  startedAt = performance.now();
  pausedDuration = 0;
  isPaused = false;
  timerCard.classList.add('is-running');
  timerOverlay.hidden = false;
  animationFrame = requestAnimationFrame(tick);
}

function reviseSettings() {
  cancelAnimationFrame(animationFrame);
  timerCard.classList.remove('is-running', 'is-paused');
  timerOverlay.hidden = true;
  renderProgress(0);
}

function tick(now) {
  if (isPaused) return;
  const elapsed = now - startedAt - pausedDuration;
  const progress = Math.min(elapsed / 8000, 1);
  renderProgress(progress);
  if (progress < 1) {
    animationFrame = requestAnimationFrame(tick);
  } else {
    setTimeout(reviseSettings, 1000);
  }
}

function readFormValues() {
  const dur = Number(document.querySelector('#duration').value);
  if (dur > 0) durationMs = dur * 60 * 1000;
  maskFeather = Number(featherAmount.value);
  wipeType = form.elements.wipeType.value;
  direction = form.elements.direction.value;
}

// --- 50% Progress Thumbnail Snapshot Generator ---
async function generateThumbnailAt50Percent() {
  readFormValues();
  thumbnailCard.hidden = false;
  const ctx = thumbnailCanvas.getContext('2d');
  const w = thumbnailCanvas.width;
  const h = thumbnailCanvas.height;

  // Scale feather amount proportionally to thumbnail dimensions
  const mainW = timerCanvas.clientWidth || 600;
  const scaleFactor = w / mainW;
  const f = maskFeather * scaleFactor;

  const img1 = new Image();
  const img2 = new Image();
  img1.src = slots.one.file.startsWith('data:') ? slots.one.file : `images/${encodeURIComponent(slots.one.file)}`;
  img2.src = slots.two.file.startsWith('data:') ? slots.two.file : `images/${encodeURIComponent(slots.two.file)}`;

  await Promise.all([
    new Promise((r) => { img1.onload = r; img1.onerror = r; }),
    new Promise((r) => { img2.onload = r; img2.onerror = r; }),
  ]);

  ctx.clearRect(0, 0, w, h);
  if (img1.complete && img1.naturalWidth) ctx.drawImage(img1, 0, 0, w, h);

  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const offCtx = offscreen.getContext('2d');

  if (img2.complete && img2.naturalWidth) {
    offCtx.drawImage(img2, 0, 0, w, h);
    offCtx.globalCompositeOperation = 'destination-in';

    const progress = 0.5;
    const cx = w * origin.x;
    const cy = h * origin.y;

    if (wipeType === 'circle') {
      const farthestCorner = Math.max(
        Math.hypot(cx, cy),
        Math.hypot(w - cx, cy),
        Math.hypot(cx, h - cy),
        Math.hypot(w - cx, h - cy)
      );
      const maxDist = farthestCorner + f / 2 + 1;
      const minRadius = -f / 2;
      const maxRadiusBuffered = maxDist + f / 2;

      const currentRadius = minRadius + (maxRadiusBuffered - minRadius) * (direction === 'forward' ? progress : 1 - progress);
      const innerRadius = Math.max(0, currentRadius - f / 2);
      const outerRadius = Math.max(0, currentRadius + f / 2);

      const maxR = Math.max(outerRadius, 1);
      const grad = offCtx.createRadialGradient(cx, cy, 0, cx, cy, maxR);

      const stopInner = Math.min(1, Math.max(0, innerRadius / maxR));
      const stopOuter = Math.min(1, Math.max(0, outerRadius / maxR));

      if (direction === 'forward') {
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(stopInner, 'rgba(0,0,0,1)');
        grad.addColorStop(stopOuter, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(stopInner, 'rgba(0,0,0,0)');
        grad.addColorStop(stopOuter, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
      }
      offCtx.fillStyle = grad;
      offCtx.fillRect(0, 0, w, h);

    } else if (wipeType === 'horizontal') {
      const startEdge = -f / 2;
      const endEdge = w + f / 2 + 1;
      const edge = startEdge + (endEdge - startEdge) * progress;
      const innerEdge = Math.max(0, edge - f / 2);
      const outerEdge = Math.max(0, edge + f / 2);

      let grad;
      if (direction === 'forward') {
        grad = offCtx.createLinearGradient(0, 0, w, 0);
        const stopInner = Math.min(1, Math.max(0, innerEdge / w));
        const stopOuter = Math.min(1, Math.max(0, outerEdge / w));
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(stopInner, 'rgba(0,0,0,1)');
        grad.addColorStop(stopOuter, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad = offCtx.createLinearGradient(w, 0, 0, 0);
        const stopInner = Math.min(1, Math.max(0, innerEdge / w));
        const stopOuter = Math.min(1, Math.max(0, outerEdge / w));
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(stopInner, 'rgba(0,0,0,1)');
        grad.addColorStop(stopOuter, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      }
      offCtx.fillStyle = grad;
      offCtx.fillRect(0, 0, w, h);

    } else if (wipeType === 'vertical') {
      const startEdge = -f / 2;
      const endEdge = h + f / 2 + 1;
      const edge = startEdge + (endEdge - startEdge) * progress;
      const innerEdge = Math.max(0, edge - f / 2);
      const outerEdge = Math.max(0, edge + f / 2);

      let grad;
      if (direction === 'forward') {
        grad = offCtx.createLinearGradient(0, 0, 0, h);
        const stopInner = Math.min(1, Math.max(0, innerEdge / h));
        const stopOuter = Math.min(1, Math.max(0, outerEdge / h));
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(stopInner, 'rgba(0,0,0,1)');
        grad.addColorStop(stopOuter, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad = offCtx.createLinearGradient(0, h, 0, 0);
        const stopInner = Math.min(1, Math.max(0, innerEdge / h));
        const stopOuter = Math.min(1, Math.max(0, outerEdge / h));
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(stopInner, 'rgba(0,0,0,1)');
        grad.addColorStop(stopOuter, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      }
      offCtx.fillStyle = grad;
      offCtx.fillRect(0, 0, w, h);

    } else if (wipeType === 'center') {
      const center = h / 2;
      const maxExtent = center + f + 1;
      const activeProgress = direction === 'forward' ? progress : 1 - progress;
      const extent = maxExtent * activeProgress;

      const topOuter = center - extent - f / 2;
      const topInner = Math.min(center, center - extent + f / 2);
      const bottomInner = Math.max(center, center + extent - f / 2);
      const bottomOuter = center + extent + f / 2;

      const grad = offCtx.createLinearGradient(0, 0, 0, h);
      const s1 = Math.min(1, Math.max(0, topOuter / h));
      const s2 = Math.min(1, Math.max(0, topInner / h));
      const s3 = Math.min(1, Math.max(0, bottomInner / h));
      const s4 = Math.min(1, Math.max(0, bottomOuter / h));

      if (direction === 'forward') {
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(s1, 'rgba(0,0,0,0)');
        grad.addColorStop(s2, 'rgba(0,0,0,1)');
        grad.addColorStop(s3, 'rgba(0,0,0,1)');
        grad.addColorStop(s4, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(s1, 'rgba(0,0,0,1)');
        grad.addColorStop(s2, 'rgba(0,0,0,0)');
        grad.addColorStop(s3, 'rgba(0,0,0,0)');
        grad.addColorStop(s4, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,1)');
      }
      offCtx.fillStyle = grad;
      offCtx.fillRect(0, 0, w, h);

    } else if (wipeType === 'crossfade') {
      const activeProgress = direction === 'forward' ? progress : 1 - progress;
      offCtx.fillStyle = `rgba(0,0,0,${activeProgress})`;
      offCtx.fillRect(0, 0, w, h);
    }

    ctx.drawImage(offscreen, 0, 0);
  }
}

async function savePreset(e) {
  e.preventDefault();
  readFormValues();
  const name = document.querySelector('#presetName').value.trim();
  if (!name) return;

  saveStatus.textContent = 'Saving preset and creating thumbnail...';

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const thumbnailDataUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.85);

  const presetData = {
    id,
    name,
    imageOne: slots.one.file,
    imageTwo: slots.two.file,
    duration: Number(document.querySelector('#duration').value),
    wipeType,
    direction,
    feather: maskFeather,
    origin,
    thumbnail: `thumbnails/${id}.jpg`,
  };

  try {
    const res = await fetch('http://localhost:3001/api/save-preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: presetData, thumbnailBase64: thumbnailDataUrl }),
    });

    if (res.ok) {
      saveStatus.textContent = `✓ Preset "${name}" and thumbnail saved successfully!`;
    } else {
      throw new Error('Server returned non-200');
    }
  } catch (err) {
    saveStatus.textContent = 'Server endpoint not found. Downloading fallback JSON file...';
    downloadFallback(presetData, id);
  }
}

function downloadFallback(preset, id) {
  const blob = new Blob([JSON.stringify([preset], null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${id}-preset.json`;
  a.click();
}

// Init & Event Listeners
renderTransitionOptions();
applyImage(slots.one, imageUrl('Default1.jpeg'), displayName('Default1.jpeg'), 'Default1.jpeg');
applyImage(slots.two, imageUrl('Default2.jpeg'), displayName('Default2.jpeg'), 'Default2.jpeg');
updateOrigin(0.5, 0.5);

Object.values(slots).forEach((slot) => {
  slot.button.addEventListener('click', () => openGallery(slot));
});

galleryClose.addEventListener('click', () => galleryDialog.close());
galleryDialog.addEventListener('click', (e) => {
  if (e.target === galleryDialog) galleryDialog.close();
});
galleryUpload.addEventListener('change', uploadImage);

originPicker.addEventListener('click', chooseOrigin);
originPicker.addEventListener('keydown', moveOrigin);

previewBtn.addEventListener('click', startPreview);
editButton.addEventListener('click', reviseSettings);
form.addEventListener('submit', savePreset);
form.addEventListener('input', generateThumbnailAt50Percent);

window.addEventListener('resize', () => {
  if (!timerCard.classList.contains('is-running')) {
    positionOriginMarker();
  }
});
