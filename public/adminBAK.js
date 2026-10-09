import { transitionsRegistry } from './transitions/index.js';

// Elements
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

// Default States as specified:
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

const slots = {
  one: {
    label: 'starting',
    button: document.querySelector('#pickerOne'),
    layer: imageOne,
    thumb: document.querySelector('#thumbOne'),
    name: document.querySelector('#fileOneName'),
    file: 'Default1.jpeg',
    onDimensions(w, h) { sourceSize = { width: w, height: h }; positionOriginMarker(); }
  },
  two: {
    label: 'finishing',
    button: document.querySelector('#pickerTwo'),
    layer: imageTwo,
    thumb: document.querySelector('#thumbTwo'),
    name: document.querySelector('#fileTwoName'),
    file: 'Default2.jpeg'
  }
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

function imageBounds(fit) {
  const width = timerCanvas.clientWidth || 600;
  const height = timerCanvas.clientHeight || 400;
  if (!sourceSize) return { left: 0, top: 0, width, height };
  const scale = fit === 'contain'
    ? Math.min(width / sourceSize.width, height / sourceSize.height)
    : Math.max(width / sourceSize.width, height / sourceSize.height);
  const fittedWidth = sourceSize.width * scale;
  const fittedHeight = sourceSize.height * scale;
  return { left: (width - fittedWidth) / 2, top: (height - fittedHeight) / 2, width: fittedWidth, height: fittedHeight };
}

function canvasOrigin(fit) {
  const bounds = imageBounds(fit);
  return { x: bounds.left + bounds.width * origin.x, y: bounds.top + bounds.height * origin.y };
}

function positionOriginMarker() {
  const point = canvasOrigin('contain');
  originMarker.style.left = `${point.x}px`;
  originMarker.style.top = `${point.y}px`;
}

function updateOrigin(x, y) {
  origin = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  positionOriginMarker();
  generateThumbnailAt50Percent();
}

function syncOriginPicker() {
  const transition = transitionsRegistry.get(wipeType);
  originPicker.hidden = !(transition && transition.supportsOrigin);
}

// Render progress in main viewport
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
    cy: point.y
  });

  imageTwo.style.opacity = result.opacityTwo !== undefined ? result.opacityTwo : '1';
  imageTwo.style.maskImage = result.maskTwo || 'none';
  imageTwo.style.webkitMaskImage = result.maskTwo || 'none';
}

// --- Preview & Revision Logic ---
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
  // Speed up preview to 8 seconds for ease of testing
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

  const img1 = new Image();
  const img2 = new Image();
  img1.src = `images/${encodeURIComponent(slots.one.file)}`;
  img2.src = `images/${encodeURIComponent(slots.two.file)}`;

  await Promise.all([
    new Promise(r => { img1.onload = r; img1.onerror = r; }),
    new Promise(r => { img2.onload = r; img2.onerror = r; })
  ]);

  ctx.clearRect(0, 0, w, h);
  if (img1.complete && img1.naturalWidth) ctx.drawImage(img1, 0, 0, w, h);

  // Render Image 2 blend at 50% progress on offscreen canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const offCtx = offscreen.getContext('2d');

  if (img2.complete && img2.naturalWidth) {
    offCtx.drawImage(img2, 0, 0, w, h);
    offCtx.globalCompositeOperation = 'destination-in';

    const cx = w * origin.x;
    const cy = h * origin.y;

    if (wipeType === 'circle') {
      const grad = offCtx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.6);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      offCtx.fillStyle = grad;
    } else if (wipeType === 'crossfade') {
      offCtx.fillStyle = 'rgba(0,0,0,0.5)';
    } else {
      const grad = offCtx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      offCtx.fillStyle = grad;
    }
    offCtx.fillRect(0, 0, w, h);
    ctx.drawImage(offscreen, 0, 0);
  }
}

// --- Save Action ---
async function savePreset(e) {
  e.preventDefault();
  readFormValues();
  const name = document.querySelector('#presetName').value.trim();
  if (!name) return;

  saveStatus.textContent = 'Saving preset and creating thumbnail...';

  const id = name.toLowerCase().replace(/[^a-z0-0]+/g, '-');
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
    thumbnail: `thumbnails/${id}.jpg`
  };

  try {
    const res = await fetch('http://localhost:3001/api/save-preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: presetData, thumbnailBase64: thumbnailDataUrl })
    });

    if (res.ok) {
      saveStatus.textContent = `✓ Preset "${name}" and thumbnail saved successfully!`;
    } else {
      throw new Error('Server returned non-200');
    }
  } catch (err) {
    saveStatus.textContent = 'Server endpoint not found. Downloading presets.json fallback...';
    // Download fallback if local server node script isn't active
    downloadFallback(presetData, thumbnailDataUrl, id);
  }
}

function downloadFallback(preset, thumbnailDataUrl, id) {
  const blob = new Blob([JSON.stringify([preset], null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${id}-preset.json`;
  a.click();
}

function applyImage(slot, file) {
  slot.file = file;
  const url = `images/${encodeURIComponent(file)}`;
  slot.layer.style.backgroundImage = `url("${url}")`;
  slot.thumb.style.backgroundImage = `url("${url}")`;
  slot.name.textContent = file;
  generateThumbnailAt50Percent();
}

// Init & Event Listeners
renderTransitionOptions();
applyImage(slots.one, 'Default1.jpeg');
applyImage(slots.two, 'Default2.jpeg');
updateOrigin(0.5, 0.5);

originPicker.addEventListener('click', (e) => {
  const bounds = originPicker.getBoundingClientRect();
  updateOrigin((e.clientX - bounds.left) / bounds.width, (e.clientY - bounds.top) / bounds.height);
});

previewBtn.addEventListener('click', startPreview);
editButton.addEventListener('click', reviseSettings);
form.addEventListener('submit', savePreset);
form.addEventListener('input', generateThumbnailAt50Percent);