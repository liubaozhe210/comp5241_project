import type { Config } from 'tailwindcss';

/** 视觉沿用原型：象牙白底 + 单一墨蓝强调色 + 衬线标题 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: {
          50: '#fffdf8',
          100: '#f8f5ee',
          200: '#f6f3eb',
          300: '#efeade',
        },
        ink: {
          900: '#1b1a17',
          700: '#433f38',
          500: '#7b7669',
        },
        accent: {
          DEFAULT: '#1e3a6e',
          soft: '#e8edf6',
          hover: '#2f4f8a',
        },
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', 'Palatino', 'Georgia', '"Times New Roman"', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,26,23,.06)',
        lift: '0 2px 4px rgba(27,26,23,.05), 0 18px 36px -24px rgba(27,26,23,.4)',
      },
    },
  },
  plugins: [],
};

export default config;
