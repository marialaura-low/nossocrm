import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Macboot CRM',
    short_name: 'Macboot',
    description: 'CRM do mercado calçadista — Grupo MAC',
    start_url: '/boards',
    display: 'standalone',
    background_color: '#f4f1e8',
    theme_color: '#07432a',
    icons: [
      // SVG icons keep the repo text-only. If you need iOS splash/touch icons later,
      // add PNGs in a follow-up.
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icons/maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}

