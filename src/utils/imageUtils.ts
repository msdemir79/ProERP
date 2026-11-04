/**
 * Image processing utilities for DMR Nexus
 * Automatically resizes, optimizes, and standardizes product and label images.
 */

export interface ImageResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Resizes and compresses an image (File or base64 DataURL) using HTML5 Canvas.
 * Ensures the image fits within standard dimensions without distortion.
 */
export function resizeAndOptimizeImage(
  source: File | string,
  options: ImageResizeOptions = {}
): Promise<string> {
  const {
    maxWidth = 600,
    maxHeight = 600,
    quality = 0.85,
    format = 'image/jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    const processImage = (dataUrl: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions preserving aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const widthRatio = maxWidth / width;
          const heightRatio = maxHeight / height;
          const scale = Math.min(widthRatio, heightRatio);

          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        // Create offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Fill background with white for JPEG transparency conversion
        if (format === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        // Use high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        try {
          const optimizedDataUrl = canvas.toDataURL(format, quality);
          resolve(optimizedDataUrl);
        } catch (err) {
          console.warn('Canvas export failed, falling back to original data URL:', err);
          resolve(dataUrl);
        }
      };

      img.onerror = (err) => {
        console.warn('Image load failed during resize optimization:', err);
        resolve(dataUrl);
      };

      img.src = dataUrl;
    };

    if (typeof source === 'string') {
      processImage(source);
    } else if (source instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          processImage(result);
        } else {
          reject(new Error('Dosya okunamadı.'));
        }
      };
      reader.onerror = () => reject(new Error('Dosya yükleme hatası.'));
      reader.readAsDataURL(source);
    } else {
      reject(new Error('Geçersiz görsel kaynağı.'));
    }
  });
}
