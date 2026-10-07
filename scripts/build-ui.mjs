import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildUI() {
  for(const app of ['sovereign','atlas']) {
    await build({configFile:false,root:path.join(root,'ui',app),plugins:[react(),tailwind()],
      define:{
        'import.meta.env.VITE_API_BASE': JSON.stringify(process.env.VITE_API_BASE || 'https://ps67-backend.onrender.com'),
        'import.meta.env.VITE_ATLAS_URL': JSON.stringify(process.env.VITE_ATLAS_URL || 'https://ps67-atlas.onrender.com'),
        'import.meta.env.VITE_SOVEREIGN_URL': JSON.stringify(process.env.VITE_SOVEREIGN_URL || 'https://ps67-sovereign.onrender.com'),
      },
      build:{outDir:path.join(root,'build',app),emptyOutDir:true},logLevel:'warn'});
    console.log(`${app}: React frontend built.`);
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildUI();
