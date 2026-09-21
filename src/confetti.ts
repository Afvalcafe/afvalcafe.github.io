// Confetti uit de lucht, gedeeld door de vijver en de bingo.

import './confetti.css';

const CONFETTI_COLORS = ['#2f9be0', '#f5b800', '#7dc95e', '#e8563f', '#b06ad9', '#ff8fb1'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Kleine vlakjes vallen met wat zijwaartse drift en draaiing omlaag.
export function confetti(count: number) {
  if (reduceMotion) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    const w = 6 + Math.random() * 6;
    p.style.cssText = `left:${Math.random() * 100}vw;width:${w}px;height:${w * (0.5 + Math.random() * 0.8)}px;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};border-radius:${Math.random() < 0.3 ? '50%' : '1px'}`;
    document.body.appendChild(p);
    const drift = (Math.random() - 0.5) * 200;
    p.animate(
      [
        { transform: 'translate(0,-20px) rotate(0deg)', opacity: 1 },
        { transform: `translate(${drift}px,105vh) rotate(${360 + Math.random() * 720}deg)`, opacity: 1 },
      ],
      { duration: 2200 + Math.random() * 2200, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'forwards' },
    ).onfinish = () => p.remove();
  }
}
