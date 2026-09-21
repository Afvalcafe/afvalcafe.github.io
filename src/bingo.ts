// Afvalpaspoort: 5x5 bingo card. Tap a cell to cross it off; a full row, column or diagonal gives confetti.
// Static site, so the state only lives in this browser's localStorage.

import '@fontsource/press-start-2p';
import './bingo.css';
import { confetti } from './confetti';

const SIZE = 5;
const STORAGE_KEY = 'afvalcafe-bingo';
// Order of the card, row by row. The photos live in public/bingo/ (tools/maak_bingo_afbeeldingen.py).
const CELLS = [
  'LACHGAS-TANK', 'KLEDINGSTUK', 'ZAKJE (HONDEN)POEP', 'PLASTIC ZAKJE', 'FRUIT',
  'IETS MET STATIEGELD', 'PIEPSCHUIM', 'CONDOOM', 'SCHROEF', 'KNUFFELTJE',
  'ELEKTRONISCH APPARAAT', 'CHIPSZAK', 'FEESTSPULLEN', 'WIETZAKJE', 'GLAZEN FLES',
  'WINTERKLEDING', 'PASJE/KAART', 'IETS MET HANDSCHRIFT', 'BATTERIJ', 'PEUK',
  'BAL', 'GEBRUIKTE ZAKDOEK/WC-PAPIER :(', 'TOUW', 'BESTEK/SERVIES', 'MAKE-UP',
];

// All lines as lists of cell indices: rows, columns and the two diagonals.
const LINES: number[][] = [];
for (let i = 0; i < SIZE; i++) {
  LINES.push(Array.from({ length: SIZE }, (_, j) => i * SIZE + j));
  LINES.push(Array.from({ length: SIZE }, (_, j) => j * SIZE + i));
}
LINES.push(Array.from({ length: SIZE }, (_, i) => i * (SIZE + 1)));
LINES.push(Array.from({ length: SIZE }, (_, i) => (i + 1) * (SIZE - 1)));

const card = document.getElementById('card')!;
const message = document.getElementById('message')!;
const crossedOut = new Set<number>();

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(list)) for (const n of list) if (Number.isInteger(n) && n >= 0 && n < CELLS.length) crossedOut.add(n);
  } catch {
    // no localStorage (e.g. private browsing): the card then only works until the page is closed
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...crossedOut]));
  } catch {
    // see load()
  }
}

const isComplete = (line: number[]) => line.every((n) => crossedOut.has(n));

// Lines that are already complete, so they don't trigger confetti again. Filled with the saved state on load.
const celebrated = new Set<number>();
const updateCelebrated = () => LINES.forEach((line, i) => (isComplete(line) ? celebrated.add(i) : celebrated.delete(i)));

const buttons = CELLS.map((label, n) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cell';
  const img = document.createElement('img');
  img.src = `${import.meta.env.BASE_URL}bingo/${String(n + 1).padStart(2, '0')}.webp`;
  img.alt = '';
  const text = document.createElement('span');
  text.textContent = label;
  button.append(img, text);
  button.addEventListener('click', () => toggle(n));
  card.appendChild(button);
  return button;
});

function render() {
  buttons.forEach((button, n) => button.setAttribute('aria-pressed', String(crossedOut.has(n))));
}

function toggle(n: number) {
  if (!crossedOut.delete(n)) crossedOut.add(n);
  render();
  save();

  const newlyCompleted = LINES.filter((line, i) => isComplete(line) && !celebrated.has(i)).length;
  updateCelebrated();
  if (crossedOut.size === CELLS.length) {
    message.textContent = 'Volle kaart! Wat een afvalkampioen!';
    confetti(160);
  } else if (newlyCompleted > 0) {
    message.textContent = 'Bingo!';
    confetti(60 + 30 * newlyCompleted);
  } else {
    message.textContent = '';
  }
}

document.getElementById('reset')!.addEventListener('click', () => {
  if (crossedOut.size > 0 && !confirm('Alle vakjes weer leegmaken?')) return;
  crossedOut.clear();
  celebrated.clear();
  message.textContent = '';
  render();
  save();
});

load();
updateCelebrated();
render();
