import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_SERVER_URL || 'http://localhost:3000';
  
  return {
    plugins: [react()],
    
    // 定义全局常量
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
    
    server: {
      port: 5173,
      host: '0.0.0.0', // 允许外部访问
      proxy: {
        '/socket.io': {
          target: backendUrl,
          ws: true,
          changeOrigin: true
        },
        '/api': {
          target: backendUrl,
          changeOrigin: true
        }
      }
    },
    
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            socket: ['socket.io-client']
          }
        }
      },
      // 构建优化
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true
    },
    
    // 预览服务器配置（用于本地测试生产构建）
    preview: {
      port: 4173,
      host: '0.0.0.0'
    }
  };
});

