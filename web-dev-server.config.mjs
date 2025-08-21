import { esbuildPlugin } from '@web/dev-server-esbuild';
import proxy from 'koa-proxies';

export default {
  port: 4000,
  nodeResolve: true,
  open: '/demo/',
  watch: true,
  
  middleware: [
    proxy('/twint', {
      target: 'http://localhost:9000',
      changeOrigin: true,
      logs: true,
      events: {
        error: (err, req, res) => {
          console.error('[PROXY ERROR]', err);
        },
        proxyReq: (proxyReq, req, res) => {
          console.log(`[PROXY] ${req.method} ${req.url} -> http://localhost:9000${req.url}`);
        }
      }
    })
  ],

  // Serve files
  rootDir: '.',
  
  // Plugin for handling modern JS
  plugins: [
    esbuildPlugin({ 
      js: true,
      target: 'auto'
    })
  ],
  
  // Log configuration
  logLevel: 'info',
  
  // MIME types for modules
  mimeTypes: {
    '**/*.js': 'js',
    '**/*.mjs': 'js',
    '**/*.html': 'html',
    '**/*.css': 'css'
  }
};