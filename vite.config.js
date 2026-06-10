import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("firebase")) return "firebase";
          if (id.includes("recharts")) return "charts";
          if (id.includes("exceljs") || id.includes("pdf-parse")) return "documents";
          if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf-export";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("react-dropzone")) return "uploads";
          return "vendor";
        },
      },
    },
  },
});
