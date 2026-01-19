module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./ui/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5f8',
          100: '#d9e6ed',
          200: '#b3cddb',
          300: '#8db4c9',
          400: '#679bb7',
          500: '#032D42',
          600: '#022535',
          700: '#021d28',
          800: '#01161b',
          900: '#010f14',
        },
        neutral: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#032D42',
        },
        success: {
          DEFAULT: '#22c55e',
          bg: '#f0fdf4',
        },
        warning: {
          DEFAULT: '#fbbf24',
          bg: '#fffbeb',
        },
        error: {
          DEFAULT: '#dc2626',
          bg: '#fef2f2',
        },
        info: {
          DEFAULT: '#3b82f6',
          bg: '#eff6ff',
        },
      },
    },
  },
  plugins: [],
}

