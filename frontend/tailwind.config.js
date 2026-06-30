/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geometric Sans"', 'sans-serif'], 
        display: ['Montserrat', 'sans-serif'], 
      },
      colors: {
        brand: {
          primary: '#00b8a9',   
          secondary: '#01887b', 
          accent: '#00a294',    
        },
        surface: {
          light: '#f0f4f8',
          dark: '#111111',      
          card: '#1a1c1e',      
        },
        text: {
          primary: '#ffffff',
          muted: '#9ca3af',     
        }
      },
      borderRadius: {
        'default': '8px',       
      },
      boxShadow: {
        'level-2': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)', 
      }
    },
  },
  plugins: [],
}