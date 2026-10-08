import { pdfjs } from "react-pdf";

// Use the exact pdfjs version bundled inside react-pdf via unpkg CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
