// Tailwind 4: o plugin PostCSS mora em @tailwindcss/postcss e já cuida de @import
// e vendor prefix — postcss-import e autoprefixer não são mais necessários.
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
