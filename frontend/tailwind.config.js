/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"VT323"', 'monospace'],
      },
      colors: {
        pixel: {
          bg: '#2e222f',        // 深色背景
          panel: '#e6d6ac',     // 面板背景色 (羊皮纸色)
          wood: {
            light: '#c48c59',
            DEFAULT: '#8b5a2b',
            dark: '#5e3613',
          },
          text: {
            DEFAULT: '#4a2c2a', // 深褐色文字
            light: '#f4ecd0',
            muted: '#8b7355',
          },
          accent: {
            blue: '#4da6ff',
            green: '#76c442',
            red: '#e05353',
            yellow: '#f4d03f',
          }
        },
        // 保持原有 dark 映射以兼容现有代码，但映射到新颜色
        dark: {
          bg: '#2e222f',
          surface: '#e6d6ac', // 面板
          card: '#f4ecd0',    // 卡片比面板亮一点
          border: '#8b5a2b',  // 木质边框
          text: '#4a2c2a',    // 深色文字
          muted: '#8b7355',
        }
      },
      boxShadow: {
        'pixel': '4px 4px 0px 0px rgba(0,0,0,0.3)',
        'pixel-sm': '2px 2px 0px 0px rgba(0,0,0,0.3)',
        'pixel-inset': 'inset 4px 4px 0px 0px rgba(0,0,0,0.2)',
      }
    },
  },
  plugins: [],
}

