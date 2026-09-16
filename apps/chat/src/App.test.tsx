import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('Caneca Fácil customer chat', () => {
  it('renders a conversation instead of a website shell', () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('Oi!');
    expect(html).toContain('Vamos criar uma caneca do seu jeito?');
    expect(html).toContain('Me conta o que você imagina');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('Categorias');
    expect(html).not.toContain('Comprar agora');
    expect(html).not.toContain('<footer');
  });
});
