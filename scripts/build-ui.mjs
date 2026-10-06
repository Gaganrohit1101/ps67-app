import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildUI() {
  for(const app of ['sovereign','atlas']) {
    await build({configFile:false,root:path.join(root,'ui',app),plugins:[react(),tailwind()],
      build:{outDir:path.join(root,'build',app),emptyOutDir:true},logLevel:'warn'});
    console.log(`${app}: React frontend built.`);
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url))await buildUI();
