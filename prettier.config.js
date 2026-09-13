/** @type {import("prettier").Config} */
export default {
  // Los archivos .astro necesitan su propio analizador.
  plugins: ['prettier-plugin-astro'],
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
  printWidth: 100,
  arrowParens: 'always',
  overrides: [
    {
      files: '*.md',
      options: { printWidth: 80, proseWrap: 'preserve' },
    },
    {
      files: '*.astro',
      options: { parser: 'astro' },
    },
  ],
};
