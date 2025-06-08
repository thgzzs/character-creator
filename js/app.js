(function(){
"use strict";
// === VARIABLES & CONSTANTS ===
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&$@#()[]{}.,;:!?^~%*+-=|/\<>"\'';
const palette = document.getElementById('character-palette');
const zone = document.getElementById('character-zone');
const colorPicker = document.getElementById('colorPicker');
const MAX_RECENT = 6;

const zoomSlider = document.getElementById('zoomSlider');

function applyZoom(level) {
  zone.style.transform = `scale(${level})`;
  zone.style.transformOrigin = 'top left';
}

zoomSlider.addEventListener('input', () => {
  const zoomLevel = parseFloat(zoomSlider.value);
  applyZoom(zoomLevel);
});

// Set default zoom on page load
window.addEventListener('DOMContentLoaded', () => {
  const zoomLevel = parseFloat(zoomSlider.value || 0.75);
  zoomSlider.value = zoomLevel;
  applyZoom(zoomLevel);
});

let selected = null,
    zCounter = 1,
    symmetryEnabled = false,
    symmetryCounter = 1,
    history = [],
    future = [],
    lastSelectedKey = null,
    transformTimeout = null,
    recentColors = [];

// === PALETTE SETUP ===
chars.split('').forEach(char => {
  const span = document.createElement('span');
  span.textContent = char;
  span.className = 'char';
  span.draggable = true;
  span.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', char));
  palette.appendChild(span);
});

// === HISTORY (UNDO/REDO) ===
function saveState() {
  const snap = zone.innerHTML;
  if (history[history.length-1] === snap) return;
  history.push(snap);
  if (history.length > 50) history.shift();
  future = [];
}
function restoreState(snap) {
  zone.innerHTML = snap;
  selected = null;
  let toSelect = null;
  zone.querySelectorAll('.char').forEach(el => {
    makeDraggable(el);
    el.addEventListener('click', () => selectChar(el));
    if (`${el.textContent}_${el.dataset.cx}_${el.dataset.cy}` === lastSelectedKey) {
      toSelect = el;
    }
  });
  if (toSelect) selectChar(toSelect);
}
document.getElementById('undoBtn').addEventListener('click', () => {
  if (!history.length) return;
  future.push(zone.innerHTML);
  restoreState(history.pop());
});
document.getElementById('redoBtn').addEventListener('click', () => {
  if (!future.length) return;
  history.push(zone.innerHTML);
  restoreState(future.pop());
});

// === COLOR PICKER & HISTORY ===
function renderRecentColors() {
  const ctr = document.getElementById('recentColors');
  ctr.innerHTML = '';
  recentColors.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch';
    sw.style.backgroundColor = c;
    sw.title = c;
    sw.addEventListener('click', () => applyColor(selected, c));
    ctr.appendChild(sw);
  });
}
function addRecentColor(c) {
  if (recentColors.includes(c)) return;
  recentColors.unshift(c);
  if (recentColors.length > MAX_RECENT) recentColors.pop();
  renderRecentColors();
}
function applyColor(el, c) {
  if (!el) return;
  el.style.color = c;
  if (symmetryEnabled) {
    const m = findMirrored(el);
    if (m) m.style.color = c;
  }
}
colorPicker.addEventListener('input', () => applyColor(selected, colorPicker.value));
colorPicker.addEventListener('change', () => addRecentColor(colorPicker.value));

// === SYMMETRY TOGGLE ===
document.getElementById('symmetryToggle')
  .addEventListener('change', e => symmetryEnabled = e.target.checked);

// === DRAG & DROP ===
zone.addEventListener('dragover', e => e.preventDefault());
zone.addEventListener('drop', e => {
  e.preventDefault();
  saveState();
  createChar(e.clientX, e.clientY, e.dataTransfer.getData('text/plain'), true);
});

function createChar(mx, my, char, doSym) {
  const rect = zone.getBoundingClientRect();
  const zoomLevel = parseFloat(zoomSlider.value);

  // Adjust click position relative to scaled zone
  const cx = (mx - rect.left) / zoomLevel;
  const cy = (my - rect.top) / zoomLevel;

  // Clamp to zone boundaries
  const clampedX = Math.max(0, Math.min(cx, zone.offsetWidth));
  const clampedY = Math.max(0, Math.min(cy, zone.offsetHeight));

  const span = document.createElement('span');
  span.className = 'char';
  span.textContent = char;
  span.style.fontSize = '22px';
  span.style.zIndex = zCounter++;

  span.dataset.cx = clampedX;
  span.dataset.cy = clampedY;

  span.style.left = `${clampedX - 10}px`;
  span.style.top = `${clampedY - 10}px`;

  zone.appendChild(span);
  makeDraggable(span);
  selectChar(span);
  applyTransform(span);

  if (doSym && symmetryEnabled) {
    createMirror(span, rect, clampedX, clampedY, 0);
  }
}

function createMirror(orig, rect, cx, cy) {
  const m = orig.cloneNode(true);
  const centerX = zone.offsetWidth / 2;
  const dx = cx - centerX;
  const mx = centerX - dx;

  const id = `sym-${Date.now()}`;
  orig.dataset.symmetryId = id;
  m.dataset.symmetryId = id;

  m.dataset.cx = mx;
  m.dataset.cy = orig.dataset.cy;

  m.dataset.rotation = orig.dataset.rotation || "0";
  m.dataset.mirrorX = "true";
  m.dataset.mirrorY = "false";

  m.style.left = `${mx - m.offsetWidth / 2}px`;
  m.style.top = `${parseFloat(orig.dataset.cy) - m.offsetHeight / 2}px`;
  m.style.zIndex = zCounter++;
  m.style.fontWeight = getComputedStyle(orig).fontWeight;

  zone.appendChild(m);
  makeDraggable(m);
  applyTransform(m); // ✅ ensures consistent rotation + scaling
}

function setPos(el, cx, cy) {
  const maxX = zone.offsetWidth;
  const maxY = zone.offsetHeight;

  const clampedX = Math.max(0, Math.min(cx, maxX));
  const clampedY = Math.max(0, Math.min(cy, maxY));

  el.dataset.cx = clampedX;
  el.dataset.cy = clampedY;
  el.style.left = `${clampedX - el.offsetWidth / 2}px`;
  el.style.top  = `${clampedY - el.offsetHeight / 2}px`;
}

// === DRAGGING ===
function makeDraggable(el) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); selectChar(el);
    const rect = zone.getBoundingClientRect(),
          centerX = zone.offsetWidth / 2,
          start = {x:e.clientX, y:e.clientY,
                   cx:+el.dataset.cx, cy:+el.dataset.cy},
          mirrored = symmetryEnabled ? findMirrored(el) : null;

    function onMove(me) {
      const ncx = start.cx + (me.clientX - start.x);
      const ncy = start.cy + (me.clientY - start.y);

      setPos(el, ncx, ncy);

      if (mirrored) {
        const centerX = zone.offsetWidth / 2;
        const dx = ncx - centerX;
        const mirroredCX = centerX - dx;
        setPos(mirrored, mirroredCX, ncy);
      }
    }
    function onUp() {
      saveState();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  });
}

// === TRANSFORMS ===
['rotate','scaleX','scaleY'].forEach(prop => {
  const s = document.getElementById(`${prop}Slider`),
        i = document.getElementById(`${prop}Input`);
  s.addEventListener('input', () => (i.value = s.value, applyTransform()));
  i.addEventListener('input', () => (s.value = i.value, applyTransform()));
  s.addEventListener('change',  debounceSave);
  i.addEventListener('change',  debounceSave);
});
function debounceSave() {
  clearTimeout(transformTimeout);
  transformTimeout = setTimeout(saveState, 300);
}
function applyTransform(el = selected) {
  if (!el) return;
  const rot = +document.getElementById('rotateSlider').value,
        sx  = +document.getElementById('scaleXSlider').value,
        sy  = +document.getElementById('scaleYSlider').value,
        fx  = el.dataset.mirrorX === 'true',
        fy  = el.dataset.mirrorY === 'true',
        scaleX = fx ? -sx : sx,
        scaleY = fy ? -sy : sy;

  el.dataset.rotation = rot;
  el.style.transform = `rotate(${rot}deg) scale(${scaleX}, ${scaleY})`;

  const m = symmetryEnabled ? findMirrored(el) : null;
  if (m) {
    m.dataset.rotation = rot;
    m.dataset.mirrorX = scaleX<0;
    m.dataset.mirrorY = scaleY<0;
    m.style.transform = `rotate(${-rot}deg) scale(${-scaleX}, ${scaleY})`;
  }
}

document.getElementById('weightSlider').addEventListener('input', e => {
  if (selected) {
    selected.style.fontWeight = e.target.value;
    const mirrored = symmetryEnabled ? findMirrored(selected) : null;
    if (mirrored) mirrored.style.fontWeight = e.target.value;
  }
});

// === SELECTION ===
function selectChar(el) {
  if (selected) unselectChar(selected);
  selected = el;
  el.classList.add('selected');
  lastSelectedKey = `${el.textContent}_${el.dataset.cx}_${el.dataset.cy}`;

  // Sync controls
  const rot = getRotation(el),
        sx  = getScaleX(el),
        sy  = getScaleY(el);
  document.getElementById('rotateSlider').value = rot;
  document.getElementById('rotateInput').value  = rot;
  document.getElementById('scaleXSlider').value = Math.abs(sx);
  document.getElementById('scaleXInput').value  = Math.abs(sx);
  document.getElementById('scaleYSlider').value = Math.abs(sy);
  document.getElementById('scaleYInput').value  = Math.abs(sy);
  colorPicker.value = rgbToHex(getComputedStyle(el).color);

  const weight = getComputedStyle(el).fontWeight;
  document.getElementById('weightSlider').value = weight;

  el.dataset.mirrorX = sx < 0;
  el.dataset.mirrorY = sy < 0;

  const m = symmetryEnabled ? findMirrored(el) : null;
  if (m) m.classList.add('selected');
}
function unselectChar(el) {
  el.classList.remove('selected');
  const m = symmetryEnabled ? findMirrored(el) : null;
  if (m) m.classList.remove('selected');
}
document.addEventListener('pointerdown', (e) => {
  const isChar = e.target.classList.contains('char');
  const isInControls = e.target.closest('#controls') !== null;
  const isColorSwatch = e.target.classList.contains('color-swatch');

  if (!isChar && !isInControls && !isColorSwatch) {
    document.querySelectorAll('.char.selected').forEach(el =>
      el.classList.remove('selected')
    );
    selected = null;
    lastSelectedKey = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (!selected) return;

  const isInputFocused = document.activeElement.tagName === 'INPUT';
  const isSlider = document.activeElement.type === 'range';

  if (isInputFocused && !isSlider) return;

  const step = 1;
  let cx = parseFloat(selected.dataset.cx || 0);
  let cy = parseFloat(selected.dataset.cy || 0);

  switch (e.key) {
    case 'ArrowUp':    cy -= step; break;
    case 'ArrowDown':  cy += step; break;
    case 'ArrowLeft':  cx -= step; break;
    case 'ArrowRight': cx += step; break;
    default: return;
  }

  e.preventDefault();
  selected.dataset.cx = cx;
  selected.dataset.cy = cy;
  selected.style.left = `${cx - selected.offsetWidth / 2}px`;
  selected.style.top = `${cy - selected.offsetHeight / 2}px`;

  const mirrored = symmetryEnabled ? findMirrored(selected) : null;
  if (mirrored) {
    const rect = zone.getBoundingClientRect();
    const centerX = zone.offsetWidth / 2;
    const dxFromCenter = cx - centerX;
    const mirroredCX = centerX - dx;
    mirrored.dataset.cx = mirroredCX;
    mirrored.dataset.cy = cy;
    mirrored.style.left = `${mirroredCX - mirrored.offsetWidth / 2}px`;
    mirrored.style.top = `${cy - mirrored.offsetHeight / 2}px`;
  }
});

// === Drop handler (drag and drop new character) ===
function drop(e) {
  e.preventDefault();
  const char = e.dataTransfer.getData('text/plain');
  if (!char) return;

  saveState();
  createChar(e.clientX, e.clientY, char, true); // only ONE call
}

// === Flip H / V ===
document.getElementById('flipH').addEventListener('click', () => {
  if (!selected) return;
  selected.dataset.mirrorX = selected.dataset.mirrorX !== "true";
  applyTransform();
  selectChar(selected);
});

document.getElementById('flipV').addEventListener('click', () => {
  if (!selected) return;
  selected.dataset.mirrorY = selected.dataset.mirrorY !== "true";
  applyTransform();
  selectChar(selected);
});

// === Delete button ===
document.getElementById('deleteBtn').addEventListener('click', () => {
  if (selected) {
    const mirrored = symmetryEnabled ? findMirrored(selected) : null;
    selected.remove();
    if (mirrored) mirrored.remove();
    selected = null;
    saveState();
  }
});

// === Clone button ===
document.getElementById('cloneBtn').addEventListener('click', () => {
  if (!selected) return;

  const clone = selected.cloneNode(true);
  zone.appendChild(clone);

  const cx = parseFloat(selected.dataset.cx || 0) + 20;
  const cy = parseFloat(selected.dataset.cy || 0) + 20;

  setPos(clone, cx, cy);
  clone.style.zIndex = zCounter++;
  makeDraggable(clone);
  selectChar(clone);
});

// === Mirror Clone ===
document.getElementById('mirrorClone').addEventListener('click', () => {
  if (!selected) return;

  const clone = selected.cloneNode(true);
  zone.appendChild(clone);

  const originalCX = parseFloat(selected.dataset.cx || 0);
  const originalCY = parseFloat(selected.dataset.cy || 0);
  const originalRot = parseFloat(selected.dataset.rotation || 0);
  const scaleX = getScaleX(selected);
  const scaleY = getScaleY(selected);

  const offset = 100;
  const mirroredCX = originalCX + offset;
  let mirroredRot = (180 - originalRot + 360) % 360;
  if (mirroredRot > 180) mirroredRot = 360 - mirroredRot;

  clone.dataset.cx = mirroredCX;
  clone.dataset.cy = originalCY;
  clone.dataset.rotation = mirroredRot;
  clone.dataset.mirrorX = scaleX < 0 ? "false" : "true";
  clone.dataset.mirrorY = scaleY < 0 ? "true" : "false";

  clone.style.left = `${mirroredCX - clone.offsetWidth / 2}px`;
  clone.style.top = `${originalCY - clone.offsetHeight / 2}px`;
  clone.style.zIndex = zCounter++;
  clone.style.transform = `rotate(${mirroredRot}deg) scale(${-scaleX}, ${scaleY})`;

  makeDraggable(clone);
  selectChar(clone);
});

// === Bring to Front / Send to Back ===
document.getElementById('bringFront').addEventListener('click', () => {
  if (selected) {
    selected.style.zIndex = zCounter++;
    const mirrored = symmetryEnabled ? findMirrored(selected) : null;
    if (mirrored) mirrored.style.zIndex = zCounter++;
  }
});

document.getElementById('sendBack').addEventListener('click', () => {
  if (selected) {
    selected.style.zIndex = 1;
    const mirrored = symmetryEnabled ? findMirrored(selected) : null;
    if (mirrored) mirrored.style.zIndex = 1;
  }
});

// === Reset button ===
document.getElementById('resetBtn').addEventListener('click', () => {
  saveState(); // Save before clearing
  zone.querySelectorAll('.char').forEach(el => el.remove());
  selected = null;
});

function serializeCharacter(el) {
  return {
    char: el.textContent,
    cx: parseFloat(el.dataset.cx),
    cy: parseFloat(el.dataset.cy),
    color: getComputedStyle(el).color,
    rotation: getRotation(el),
    scaleX: Math.abs(getScaleX(el)),
    scaleY: Math.abs(getScaleY(el)),
    fontWeight: getComputedStyle(el).fontWeight,
    zIndex: parseInt(el.style.zIndex || 1),
    mirrorX: el.dataset.mirrorX === "true",
    mirrorY: el.dataset.mirrorY === "true"
  };
}

function saveCharacters() {
  const data = {
    symmetry: symmetryEnabled,
    characters: [...zone.querySelectorAll('.char')].map(serializeCharacter)
  };
  localStorage.setItem('savedCharacterLayout', JSON.stringify(data));
  alert("Character saved!");
}

function loadCharacters() {
  const json = localStorage.getItem('savedCharacterLayout');
  if (!json) return alert("No saved character layout found!");

  const data = JSON.parse(json);
  zone.querySelectorAll('.char').forEach(el => el.remove());

  symmetryEnabled = data.symmetry;
  document.getElementById('symmetryToggle').checked = symmetryEnabled;

  data.characters.forEach(obj => {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = obj.char;
    span.style.color = obj.color;
    span.style.zIndex = obj.zIndex;
    span.style.fontWeight = obj.fontWeight;
    span.dataset.cx = obj.cx;
    span.dataset.cy = obj.cy;
    span.dataset.rotation = obj.rotation;
    span.dataset.mirrorX = obj.mirrorX;
    span.dataset.mirrorY = obj.mirrorY;

    const scaleX = obj.mirrorX ? -obj.scaleX : obj.scaleX;
    const scaleY = obj.mirrorY ? -obj.scaleY : obj.scaleY;
    span.style.transform = `rotate(${obj.rotation}deg) scale(${scaleX}, ${scaleY})`;
    span.style.left = `${obj.cx - 10}px`;
    span.style.top = `${obj.cy - 10}px`;

    zone.appendChild(span);
    makeDraggable(span);
    span.addEventListener('click', () => selectChar(span));
  });

  const maxZIndex = Math.max(
    0,
    ...[...zone.querySelectorAll('.char')].map(el => parseInt(el.style.zIndex) || 0)
  );
  zCounter = maxZIndex + 1;

  alert("Character loaded!");
}

document.getElementById('saveBtn').addEventListener('click', saveCharacters);
document.getElementById('loadBtn').addEventListener('click', loadCharacters);

document.getElementById('exportBtn').addEventListener('click', () => {
  const data = localStorage.getItem('savedCharacterLayout');
  if (!data) return alert("Nothing to export!");
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'character.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    localStorage.setItem('savedCharacterLayout', reader.result);
    loadCharacters();
    e.target.value = '';
  };
  reader.readAsText(file);
});

// === UTILITIES ===
function findMirrored(el) {
  return el.dataset.symmetryId
    ? [...zone.querySelectorAll('.char')].find(o =>
        o!==el && o.dataset.symmetryId===el.dataset.symmetryId
      )
    : null;
}
function getRotation(el) {
  return +(el.style.transform.match(/rotate\((-?\d+\.?\d*)deg\)/)?.[1] || 0);
}
function getScaleX(el) {
  return +(el.style.transform.match(/scale\((-?\d+\.?\d*),/)?.[1] || 1);
}
function getScaleY(el) {
  return +(el.style.transform.match(/scale\(-?\d+\.?\d*,\s*(-?\d+\.?\d*)\)/)?.[1] || 1);
}
function rgbToHex(rgb) {
  return '#' + rgb.match(/\d+/g)
    .map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
}
function getZoneLabel(x,y) {
  const zr = zone.getBoundingClientRect(), relX = x-zr.left, relY = y-zr.top;
  for (let sub of zone.querySelectorAll('.subzone')) {
    const r = sub.getBoundingClientRect(),
          lx = r.left-zr.left, ty = r.top-zr.top;
    if (relX>=lx && relX<=lx+r.width && relY>=ty && relY<=ty+r.height)
      return sub.textContent.trim();
  }
  return 'None';
}

window.drop = drop;

let isPanning = false;
let startX, startY;
let scrollLeft, scrollTop;

const wrapper = document.getElementById('character-zone-wrapper');

wrapper.addEventListener('mousedown', (e) => {
  // Only pan if clicking on empty space (not a char or control)
  if (e.target.closest('.char') || e.target.closest('#controls')) return;

  isPanning = true;
  wrapper.classList.add('dragging');
  startX = e.pageX - wrapper.offsetLeft;
  startY = e.pageY - wrapper.offsetTop;
  scrollLeft = wrapper.scrollLeft;
  scrollTop = wrapper.scrollTop;
});

wrapper.addEventListener('mouseleave', () => {
  isPanning = false;
  wrapper.classList.remove('dragging');
});

wrapper.addEventListener('mouseup', () => {
  isPanning = false;
  wrapper.classList.remove('dragging');
});

wrapper.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  e.preventDefault();
  const x = e.pageX - wrapper.offsetLeft;
  const y = e.pageY - wrapper.offsetTop;
  const walkX = x - startX;
  const walkY = y - startY;
  wrapper.scrollLeft = scrollLeft - walkX;
  wrapper.scrollTop = scrollTop - walkY;
});

wrapper.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomStep = 0.05;
  const rect = wrapper.getBoundingClientRect();
  const offsetX = e.clientX - rect.left + wrapper.scrollLeft;
  const offsetY = e.clientY - rect.top + wrapper.scrollTop;
  const scale = parseFloat(zoomSlider.value);
  const percentX = offsetX / (zone.offsetWidth * scale);
  const percentY = offsetY / (zone.offsetHeight * scale);

  let newScale = scale + (e.deltaY > 0 ? -zoomStep : zoomStep);
  newScale = Math.min(2, Math.max(0.5, newScale));
  zoomSlider.value = newScale.toFixed(2);
  applyZoom(newScale);

  const newWidth = zone.offsetWidth * newScale;
  const newHeight = zone.offsetHeight * newScale;

  wrapper.scrollLeft = newWidth * percentX - wrapper.clientWidth / 2;
  wrapper.scrollTop = newHeight * percentY - wrapper.clientHeight / 2;
}, { passive: false });

})();
