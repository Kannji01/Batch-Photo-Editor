import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  
  const [baseImages, setBaseImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [overlayPath, setOverlayPath] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [opacity, setOpacity] = useState(1);
  const [exportFormat, setExportFormat] = useState("jpg");
  const [exportQuality, setExportQuality] = useState(90);
  const [prefix, setPrefix] = useState("");
  const [isMosaic, setIsMosaic] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = new fabric.Canvas(canvasRef.current, { selection: true });
    setFabricCanvas(canvas);
    return () => { canvas.dispose(); };
  }, []);

  const fileToBase64Url = async (path: string): Promise<string> => {
    const bytes = await readFile(path);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
    return `data:image/png;base64,${window.btoa(binary)}`;
  };

  const loadBackground = async (path: string, canvas: fabric.Canvas) => {
    try {
      const dataUrl = await fileToBase64Url(path);
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const MAX_SIZE = 550;
        const scale = Math.min(MAX_SIZE / (img.naturalWidth || img.width), MAX_SIZE / (img.naturalHeight || img.height));
        canvas.setDimensions({ width: Math.round((img.naturalWidth || img.width) * scale), height: Math.round((img.naturalHeight || img.height) * scale) });
        canvas.backgroundImage = new fabric.FabricImage(img, { originX: "left", originY: "top", scaleX: scale, scaleY: scale });
        canvas.renderAll();
      };
    } catch (e) { alert("Error loading image: " + e); }
  };

  const handleSelectBaseImages = async () => {
    if (!fabricCanvas) return;
    const selected = await open({ multiple: true, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    setBaseImages(paths);
    setCurrentIndex(0);
    loadBackground(paths[0], fabricCanvas);
  };

  const handleNextImage = () => {
    if (currentIndex < baseImages.length - 1 && fabricCanvas) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      loadBackground(baseImages[nextIdx], fabricCanvas);
    }
  };

  const handlePrevImage = () => {
    if (currentIndex > 0 && fabricCanvas) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      loadBackground(baseImages[prevIdx], fabricCanvas);
    }
  };

  const handleSelectOverlay = async () => {
    if (!fabricCanvas) return;
    const selected = await open({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (!selected) return;
    const path = selected as string;
    setOverlayPath(path);

    try {
      const dataUrl = await fileToBase64Url(path);
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        const old = fabricCanvas.getObjects().find((o) => (o as any).customId === "overlayImage");
        if (old) fabricCanvas.remove(old);
        const bgImg = fabricCanvas.backgroundImage;
        if (!bgImg) return;
        
        const initialScale = ((bgImg.width! * bgImg.scaleX!) * 0.3) / (img.naturalWidth || 1);
        const overlayImg = new fabric.FabricImage(img, {
          left: 20, top: 20, originX: "left", originY: "top",
          scaleX: initialScale, scaleY: initialScale, opacity: opacity,
          cornerColor: "#38bdf8", borderColor: "#38bdf8", transparentCorners: false,
        });
        (overlayImg as any).customId = "overlayImage";

        const keepInBounds = () => {
          overlayImg.setCoords();
          const bg = fabricCanvas.backgroundImage;
          if (!bg) return;
          const cw = bg.width! * bg.scaleX!;
          const ch = bg.height! * bg.scaleY!;
          const objW = overlayImg.width! * overlayImg.scaleX!;
          const objH = overlayImg.height! * overlayImg.scaleY!;
          let newLeft = Math.max(0, Math.min(overlayImg.left || 0, cw - objW));
          let newTop = Math.max(0, Math.min(overlayImg.top || 0, ch - objH));
          overlayImg.set({ left: newLeft, top: newTop });
        };
        overlayImg.on("moving", keepInBounds);
        overlayImg.on("scaling", keepInBounds);
        fabricCanvas.add(overlayImg);
        fabricCanvas.setActiveObject(overlayImg);
        fabricCanvas.renderAll();
      };
    } catch (e) { alert("Error adding overlay: " + e); }
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOpacity(val);
    if (!fabricCanvas) return;
    const overlay = fabricCanvas.getObjects().find((o) => (o as any).customId === "overlayImage");
    if (overlay) { overlay.set({ opacity: val }); fabricCanvas.renderAll(); }
  };

  const handleSaveAll = async () => {
    if (!fabricCanvas || baseImages.length === 0) return alert("Please select base images first!");
    const outputDir = await open({ directory: true, multiple: false, title: "Select output folder" });
    if (!outputDir) return;

    setIsProcessing(true);
    setProgress(0);

    const bgImg = fabricCanvas.backgroundImage;
    const overlayObj = fabricCanvas.getObjects().find((o) => (o as any).customId === "overlayImage");
    let overlayData = null;
    
    if (overlayObj && overlayPath && bgImg) {
      const bgW = bgImg.width! * bgImg.scaleX!;
      const bgH = bgImg.height! * bgImg.scaleY!;
      overlayData = {
        overlay_path: overlayPath,
        x_ratio: (overlayObj.left || 0) / bgW,
        y_ratio: (overlayObj.top || 0) / bgH,
        width_ratio: (overlayObj.width! * overlayObj.scaleX!) / bgW,
        height_ratio: (overlayObj.height! * overlayObj.scaleY!) / bgH,
        opacity: opacity,
      };
    }

    const unlisten = await listen<number>("progress", (event) => {
      setProgress(event.payload);
    });

    try {
      const res = await invoke<string>("process_batch_images", {
        files: baseImages,
        outputDir: outputDir as string,
        overlay: overlayData,
        format: exportFormat,
        quality: exportQuality,
        prefix: prefix,
        isMosaic: isMosaic,
      });
      alert(res);
    } catch (err) { alert("Processing error: " + err); } 
    finally { 
      setIsProcessing(false);
      setProgress(0);
      unlisten(); 
    }
  };

  return (
    <div style={{ padding: "24px", fontFamily: "sans-serif", color: "#fff", background: "#0b0f19", minHeight: "100vh" }}>
      <h2 style={{ margin: "0 0 20px 0" }}>Batch Photo Editor ({baseImages.length} images)</h2>

      <div style={{ display: "flex", gap: "10px", marginBottom: "15px", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={handleSelectBaseImages} style={{ padding: "10px 16px", cursor: "pointer", background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>
          1. Select Base Images
        </button>
        <button onClick={handleSelectOverlay} style={{ padding: "10px 16px", cursor: "pointer", background: "#475569", color: "#fff", border: "none", borderRadius: "6px" }}>
          2. Add Overlay Logo
        </button>
        <button onClick={handleSaveAll} disabled={isProcessing} style={{ padding: "10px 18px", cursor: isProcessing ? "not-allowed" : "pointer", background: isProcessing ? "#64748b" : "#10b981", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}>
          {isProcessing ? `Processing... ${progress}%` : "3. Export All to Disk"}
        </button>
      </div>

      {isProcessing && (
        <div style={{ width: "100%", background: "#334155", borderRadius: "4px", marginBottom: "15px", overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, background: "#10b981", height: "8px", transition: "width 0.2s" }}></div>
        </div>
      )}

      <div style={{ display: "flex", gap: "20px", marginBottom: "20px", background: "#1e293b", padding: "15px", borderRadius: "6px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", color: "#94a3b8" }}>Preview:</span>
          <button onClick={handlePrevImage} disabled={currentIndex === 0 || baseImages.length === 0} style={{ padding: "5px 10px", cursor: "pointer", background: "#334155", color: "#fff", border: "none", borderRadius: "4px" }}>&larr; Prev</button>
          <span style={{ fontSize: "14px" }}>{baseImages.length > 0 ? currentIndex + 1 : 0} / {baseImages.length}</span>
          <button onClick={handleNextImage} disabled={currentIndex === baseImages.length - 1 || baseImages.length === 0} style={{ padding: "5px 10px", cursor: "pointer", background: "#334155", color: "#fff", border: "none", borderRadius: "4px" }}>Next &rarr;</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", color: "#94a3b8" }}>Opacity: {Math.round(opacity * 100)}%</span>
         <input 
            type="range" 
            min="0.1" 
            max="1" 
            step="0.05" 
            value={opacity} 
            onChange={handleOpacityChange} 
            className="clean-slider"
            style={{ '--val': `${((opacity - 0.1) / 0.9) * 100}%` } as React.CSSProperties}
          />
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "14px", color: "#94a3b8" }}>Prefix:</span>
          <input type="text" placeholder="e.g. edit_" value={prefix} onChange={(e) => setPrefix(e.target.value)} style={{ width: "80px", padding: "6px", borderRadius: "4px", background: "#334155", color: "#fff", border: "1px solid #475569" }} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", fontSize: "14px", color: "#94a3b8" }}>
          <input type="checkbox" checked={isMosaic} onChange={(e) => setIsMosaic(e.target.checked)} />
          Tiled Watermark
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} style={{ padding: "6px", borderRadius: "4px", background: "#334155", color: "#fff", border: "1px solid #475569" }}>
            <option value="jpg">JPG</option>
            <option value="png">PNG</option>
            <option value="webp">WEBP</option>
          </select>
          <input type="number" min="10" max="100" value={exportQuality} onChange={(e) => setExportQuality(Number(e.target.value))} style={{ width: "50px", padding: "6px", borderRadius: "4px", background: "#334155", color: "#fff", border: "1px solid #475569" }} />
        </div>
      </div>

      <div style={{ display: "inline-block", border: "2px solid #38bdf8", borderRadius: "6px", lineHeight: 0, overflow: "hidden", background: "#1e293b" }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}