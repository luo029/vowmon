// image-utils.js
// 后台图片上传前的统一处理：压缩 → 等比缩放 → 输出 PNG（保留透明背景）
// 约定：输出为正方形画布，最长边不超过 size；不裁切、不放大（小图保持原尺寸，避免糊）
const ImageUtils = {
    // 统一的压缩尺寸选项（同步配置里可选）
    SIZE_OPTIONS: [256, 512, 768, 1024],
    DEFAULT_SIZE: 512,

    // 把 File 读成可绘制的图像源（优先 createImageBitmap，兼容性更好、性能更高）
    async loadSource(file) {
        if (typeof createImageBitmap === 'function') {
            try {
                return await createImageBitmap(file);
            } catch (e) {
                // 某些格式（如部分 HEIC/SVG）不支持，退回 <img> 解码
            }
        }
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('无法读取这张图片，建议使用 PNG / JPG / WEBP 格式'));
            };
            img.src = url;
        });
    },

    // 压缩主流程：返回 { base64, blob, width, height, canvasSize, bytes }
    async compressToPng(file, size = this.DEFAULT_SIZE) {
        const source = await this.loadSource(file);
        const sw = source.width || source.naturalWidth || 0;
        const sh = source.height || source.naturalHeight || 0;
        if (!sw || !sh) throw new Error('图片尺寸异常，无法处理');

        const target = Math.min(4096, Math.max(64, parseInt(size, 10) || this.DEFAULT_SIZE));
        // 正方形画布：长边取「原图长边」与「目标尺寸」的较小值，保证不放大
        const canvasSize = Math.min(target, Math.max(sw, sh));

        const canvas = document.createElement('canvas');
        canvas.width = canvasSize;
        canvas.height = canvasSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('当前浏览器不支持 Canvas，无法压缩图片');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const scale = canvasSize / Math.max(sw, sh);
        const dw = Math.max(1, Math.round(sw * scale));
        const dh = Math.max(1, Math.round(sh * scale));
        ctx.clearRect(0, 0, canvasSize, canvasSize);
        ctx.drawImage(source, Math.round((canvasSize - dw) / 2), Math.round((canvasSize - dh) / 2), dw, dh);

        if (typeof source.close === 'function') source.close();

        const dataUrl = canvas.toDataURL('image/png');
        const blob = await new Promise((resolve) => {
            if (typeof canvas.toBlob === 'function') canvas.toBlob(resolve, 'image/png');
            else resolve(null);
        });

        // WebP 副产物：同图同时上传 .webp，前台反代优先命中，体积约为 PNG 的 1/6。
        // 浏览器不支持 WebP 编码时静默跳过，不影响原 PNG 上传。
        let webpBase64 = '';
        try {
            const webpUrl = canvas.toDataURL('image/webp', 0.86);
            if (webpUrl && webpUrl.indexOf('data:image/webp') === 0) webpBase64 = webpUrl.split(',')[1] || '';
        } catch (e) { /* 不支持 WebP 编码 */ }

        return {
            base64: dataUrl.split(',')[1] || '',
            webpBase64,
            blob,
            width: dw,
            height: dh,
            canvasSize,
            bytes: blob ? blob.size : 0
        };
    },

    formatBytes(n) {
        const num = Number(n) || 0;
        if (num < 1024) return num + ' B';
        if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
        return (num / 1024 / 1024).toFixed(2) + ' MB';
    }
};

window.ImageUtils = ImageUtils;
