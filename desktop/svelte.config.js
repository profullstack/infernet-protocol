import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      // Static adapter options
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    alias: {
      '$components': 'src/components',
      '$stores': 'src/stores',
      '$lib': 'src/lib',
      '$assets': 'src/assets'
    }
  }
};

export default config;
