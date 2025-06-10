import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["src/**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
  },
  {
    files: ["src/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        MAIN_WINDOW_VITE_DEV_SERVER_URL: true,
        MAIN_WINDOW_VITE_NAME: true,
      },
    },
  },
  {
    files: ["src/renderer/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        MAIN_WINDOW_VITE_DEV_SERVER_URL: true,
        MAIN_WINDOW_VITE_NAME: true,
        API: true,
        require: true,
      },
    },
  },
]);
