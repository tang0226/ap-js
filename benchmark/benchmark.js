const worker = new Worker('worker.js', { type: 'module' });

worker.onmessage = (e) => {
  console.log(e.data);
}

worker.postMessage('run');