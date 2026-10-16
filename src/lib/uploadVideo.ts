export function uploadVideo(url: string, file: File, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', abort);
    if (signal?.aborted) { reject(new Error('Upload cancelled')); return; }
    xhr.open('POST', url); xhr.setRequestHeader('Content-Type', file.type);
    xhr.timeout = 120000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => {
      done();
      try {
        if (xhr.status < 200 || xhr.status >= 300) throw new Error('Upload failed');
        const data = JSON.parse(xhr.responseText);
        if (typeof data.storageId !== 'string') throw new Error('Upload failed');
        resolve(data.storageId);
      } catch { reject(new Error('Upload failed. Please try again.')); }
    };
    xhr.onerror = xhr.ontimeout = () => { done(); reject(new Error('Upload connection failed. Please try again.')); };
    xhr.onabort = () => { done(); reject(new Error('Upload cancelled')); };
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}
