import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Netlify names each build after its commit (COMMIT_REF); local builds get a timestamp
const buildEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const BUILD_ID = buildEnv.COMMIT_REF || `local-${Date.now().toString(36)}`;

/** Writes version.json, which open display boards check to notice a new release */
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    }
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID)
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          editor: [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-underline',
            '@tiptap/extension-link',
            '@tiptap/extension-text-align',
            '@tiptap/extension-placeholder',
            '@tiptap/extension-text-style',
            '@tiptap/extension-color'
          ]
        }
      }
    }
  }
});
