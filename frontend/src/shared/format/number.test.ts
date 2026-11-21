import { describe, it, expect } from 'vitest';
import {
  formatAmount,
  formatSigned,
  formatMoney,
  formatCompact,
  formatPercent,
  formatPoints,
  formatRate,
  isNegative,
} from './number';

const MINUS = '−';

describe('formatAmount', () => {
  it('agrupa miles con coma', () => {
    expect(formatAmount(12957553)).toBe('12,957,553');
  });

  it('usa U+2212 para negativos', () => {
    expect(formatAmount(-977540)).toBe(`${MINUS}977,540`);
  });

  it('aplica decimales', () => {
    expect(formatAmount(1234.5, 2)).toBe('1,234.50');
  });

  it('redondea al estándar (mitad lejos de cero)', () => {
    expect(formatAmount(2.5)).toBe('3');
    expect(formatAmount(-2.5)).toBe(`${MINUS}3`);
    expect(formatAmount(0.005, 2)).toBe('0.01');
  });

  it('devuelve "0" para cero, -0 y valores que redondean a cero', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(-0)).toBe('0');
    expect(formatAmount(0.4)).toBe('0');
    expect(formatAmount(-0.4)).toBe('0');
    expect(formatAmount(-0.001, 2)).toBe('0');
  });
});

describe('formatSigned', () => {
  it('antepone + a positivos', () => {
    expect(formatSigned(300000)).toBe('+300,000');
  });

  it('usa U+2212 para negativos', () => {
    expect(formatSigned(-41401)).toBe(`${MINUS}41,401`);
  });

  it('no pone signo al cero', () => {
    expect(formatSigned(0)).toBe('0');
    expect(formatSigned(-0)).toBe('0');
    expect(formatSigned(0.001, 2)).toBe('0');
  });

  it('respeta decimales en negativos', () => {
    expect(formatSigned(-78.4319, 2)).toBe(`${MINUS}78.43`);
  });

  it('respeta decimales en positivos', () => {
    expect(formatSigned(1.5, 2)).toBe('+1.50');
  });
});

describe('formatMoney', () => {
  it('antepone el código de moneda con espacio', () => {
    expect(formatMoney(8333, 'USD')).toBe('USD 8,333');
    expect(formatMoney(65000, 'GTQ')).toBe('GTQ 65,000');
  });

  it('formatea negativos con U+2212', () => {
    expect(formatMoney(-2039, 'USD')).toBe(`USD ${MINUS}2,039`);
  });

  it('acepta decimales', () => {
    expect(formatMoney(1234.5, 'USD', 2)).toBe('USD 1,234.50');
  });
});

describe('formatCompact', () => {
  it('millones con 2 decimales y sufijo M', () => {
    expect(formatCompact(12957553)).toBe('12.96 M');
  });

  it('negativos en millones con U+2212', () => {
    expect(formatCompact(-41491120)).toBe(`${MINUS}41.49 M`);
  });

  it('miles con 0 decimales y sufijo K', () => {
    expect(formatCompact(142000)).toBe('142 K');
    expect(formatCompact(1000)).toBe('1 K');
  });

  it('negativos en miles con U+2212', () => {
    expect(formatCompact(-142000)).toBe(`${MINUS}142 K`);
  });

  it('menores a 1,000 usan formatAmount', () => {
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(-999)).toBe(`${MINUS}999`);
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(-0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('convierte proporción a porcentaje con espacio antes de %', () => {
    expect(formatPercent(0.11951)).toBe('11.95 %');
  });

  it('negativos con U+2212', () => {
    expect(formatPercent(-1.919)).toBe(`${MINUS}191.90 %`);
  });

  it('acepta decimales personalizados', () => {
    expect(formatPercent(0.5, 0)).toBe('50 %');
  });
});

describe('formatPoints', () => {
  it('diferencia en puntos porcentuales con signo', () => {
    expect(formatPoints(0.0131)).toBe('+1.31 pp');
  });

  it('negativos con U+2212', () => {
    expect(formatPoints(-0.0225)).toBe(`${MINUS}2.25 pp`);
  });

  it('cero sin signo', () => {
    expect(formatPoints(0)).toBe('0 pp');
  });
});

describe('formatRate', () => {
  it('siempre con decimales, sin miles si es menor a 1000', () => {
    expect(formatRate(18.7)).toBe('18.70');
    expect(formatRate(999.99)).toBe('999.99');
  });

  it('agrupa miles cuando el valor lo requiere', () => {
    expect(formatRate(1234.5)).toBe('1,234.50');
  });
});

describe('isNegative', () => {
  it('true solo si el valor es menor que cero', () => {
    expect(isNegative(-1)).toBe(true);
    expect(isNegative(-0.0001)).toBe(true);
    expect(isNegative(0)).toBe(false);
    expect(isNegative(-0)).toBe(false);
    expect(isNegative(1)).toBe(false);
  });
});
