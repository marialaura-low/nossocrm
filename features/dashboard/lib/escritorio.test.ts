import { describe, it, expect } from 'vitest';
import { nomeEscritorio } from './escritorio';

describe('nomeEscritorio', () => {
  it('corta o boilerplate societário/representação', () => {
    expect(nomeEscritorio('REP GO REPRESENTACAO COMERCIAL LTDA')).toBe('REP GO');
    expect(nomeEscritorio('GREEN SHOES REPRESENTACAO COMERCIAL LTDA')).toBe('GREEN SHOES');
    expect(nomeEscritorio('CETEL REPRESENTACAO COMERCIAL DE CALCADO')).toBe('CETEL');
    expect(nomeEscritorio('PXG GLOBAL COMERCIO E SERVICOS LTDA')).toBe('PXG GLOBAL');
    expect(nomeEscritorio('ANDERSON PEREIRA SILVA ME')).toBe('ANDERSON PEREIRA SILVA');
    expect(nomeEscritorio("JD' LUCA LTDA")).toBe("JD' LUCA");
  });

  it('preserva nomes curtos/sem boilerplate', () => {
    expect(nomeEscritorio('B2B SIM')).toBe('B2B SIM');
    expect(nomeEscritorio('MACBOOT')).toBe('MACBOOT');
  });
});
