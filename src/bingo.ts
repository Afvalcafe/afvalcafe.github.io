// Afvalpaspoort: 5x5 bingokaart. Tik een vakje om het door te strepen; een volle rij, kolom of diagonaal geeft confetti.
// Statische site, dus de stand staat alleen in localStorage van deze browser.

import '@fontsource/press-start-2p';
import './bingo.css';
import { confetti } from './confetti';

const KANT = 5;
const OPSLAG = 'afvalcafe-bingo';
// Volgorde van de kaart, rij voor rij. De foto's staan in public/bingo/ (tools/maak_bingo_afbeeldingen.py).
const VAKJES = [
  'LACHGAS-TANK', 'KLEDINGSTUK', 'ZAKJE (HONDEN)POEP', 'PLASTIC ZAKJE', 'FRUIT',
  'IETS MET STATIEGELD', 'PIEPSCHUIM', 'CONDOOM', 'SCHROEF', 'KNUFFELTJE',
  'ELEKTRONISCH APPARAAT', 'CHIPSZAK', 'FEESTSPULLEN', 'WIETZAKJE', 'GLAZEN FLES',
  'WINTERKLEDING', 'PASJE/KAART', 'IETS MET HANDSCHRIFT', 'BATTERIJ', 'PEUK',
  'BAL', 'GEBRUIKTE ZAKDOEK/WC-PAPIER :(', 'TOUW', 'BESTEK/SERVIES', 'MAKE-UP',
];

// Alle lijnen als lijstjes van vakje-nummers: rijen, kolommen en twee diagonalen.
const LIJNEN: number[][] = [];
for (let i = 0; i < KANT; i++) {
  LIJNEN.push(Array.from({ length: KANT }, (_, j) => i * KANT + j));
  LIJNEN.push(Array.from({ length: KANT }, (_, j) => j * KANT + i));
}
LIJNEN.push(Array.from({ length: KANT }, (_, i) => i * (KANT + 1)));
LIJNEN.push(Array.from({ length: KANT }, (_, i) => (i + 1) * (KANT - 1)));

const kaart = document.getElementById('kaart')!;
const melding = document.getElementById('melding')!;
const doorgestreept = new Set<number>();

function laad() {
  try {
    const lijst = JSON.parse(localStorage.getItem(OPSLAG) ?? '[]');
    if (Array.isArray(lijst)) for (const n of lijst) if (Number.isInteger(n) && n >= 0 && n < VAKJES.length) doorgestreept.add(n);
  } catch {
    // geen localStorage (bijvoorbeeld privémodus): dan werkt de kaart tot je de pagina sluit
  }
}

function bewaar() {
  try {
    localStorage.setItem(OPSLAG, JSON.stringify([...doorgestreept]));
  } catch {
    // zie laad()
  }
}

const isVol = (lijn: number[]) => lijn.every((n) => doorgestreept.has(n));

// Lijnen die al vol zijn en dus niet nog eens confetti geven. Bij het laden vullen we dit met wat er al staat.
const gevierd = new Set<number>();
const werkGevierdBij = () => LIJNEN.forEach((lijn, i) => (isVol(lijn) ? gevierd.add(i) : gevierd.delete(i)));

const knoppen = VAKJES.map((label, n) => {
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'vakje';
  const img = document.createElement('img');
  img.src = `${import.meta.env.BASE_URL}bingo/${String(n + 1).padStart(2, '0')}.webp`;
  img.alt = '';
  const tekst = document.createElement('span');
  tekst.textContent = label;
  knop.append(img, tekst);
  knop.addEventListener('click', () => wissel(n));
  kaart.appendChild(knop);
  return knop;
});

function teken() {
  knoppen.forEach((knop, n) => knop.setAttribute('aria-pressed', String(doorgestreept.has(n))));
}

function wissel(n: number) {
  if (!doorgestreept.delete(n)) doorgestreept.add(n);
  teken();
  bewaar();

  const nieuw = LIJNEN.filter((lijn, i) => isVol(lijn) && !gevierd.has(i)).length;
  werkGevierdBij();
  if (doorgestreept.size === VAKJES.length) {
    melding.textContent = 'Volle kaart! Wat een afvalkampioen!';
    confetti(160);
  } else if (nieuw > 0) {
    melding.textContent = 'Bingo!';
    confetti(60 + 30 * nieuw);
  } else {
    melding.textContent = '';
  }
}

document.getElementById('reset')!.addEventListener('click', () => {
  if (doorgestreept.size > 0 && !confirm('Alle vakjes weer leegmaken?')) return;
  doorgestreept.clear();
  gevierd.clear();
  melding.textContent = '';
  teken();
  bewaar();
});

laad();
werkGevierdBij();
teken();
