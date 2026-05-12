import { APContext } from '../ap.js';

const ten15 = 10 ** 15;

function randomString(len) {
  let str = '';
  for (let i = 0; i < Math.floor(len / 15); i++) {
    str += Math.floor(Math.random() * ten15);
  }
  if (len % 15) {
    str += Math.floor(Math.random() * (10 ** (len % 15)));
  }
  return str;
}

onmessage = (e) => {
  if (e.data !== 'run') return;

  const numbers = [];
  const trialCount = 100000;
  const digs = 100;
  for (let i = 0; i < trialCount * 2; i++) {
    numbers.push(randomString(digs));
  }


  const ctx = new APContext(Math.ceil(digs * Math.log2(10)));
  const tmp = ctx.ap();

  const bigints = numbers.map((x) => BigInt(x));
  const aps = numbers.map((x) => ctx.ap(x));
  const len = numbers.length;

  const bigintSquares = [];
  for (let i = 0; i < trialCount; i++) {
    bigintSquares.push(bigints[i] ** 2n);
    bigintSquares.push(0);
  }

  // addition
  // BigInt
  let i = 0;
  let val;
  let start = performance.now();
  while (i < len) {
    val = bigints[i++] + bigints[i++];
  }
  let time = performance.now() - start;
  postMessage(`BigInt addition, ${digs} digs, ${trialCount} trials: ${time} ms, ${Math.floor(trialCount / time * 1000)} ops/sec`);

  // AP
  i = 0;
  start = performance.now();
  while (i < len) {
    ctx.add(tmp, aps[i++], aps[i++]);
  }
  time = performance.now() - start;
  postMessage(`AP addition, ${digs} digs, ${trialCount} trials: ${time} ms, ${Math.floor(trialCount / time * 1000)} ops/sec`);

  // Multiplication
  // BigInt
  i = 0;
  start = performance.now();
  while (i < len) {
    val = bigints[i++] * bigints[i++];
  }
  time = performance.now() - start;
  postMessage(`BigInt multiplication, ${digs} digs, ${trialCount} trials: ${time} ms, ${Math.floor(trialCount / time * 1000)} ops/sec`);

  // AP
  i = 0;
  start = performance.now();
  while (i < len) {
    ctx.mul(tmp, aps[i++], aps[i++]);
  }
  time = performance.now() - start;
  postMessage(`AP multiplication, ${digs} digs, ${trialCount} trials: ${time} ms, ${Math.floor(trialCount / time * 1000)} ops/sec`);

  // Division
  // BigInt
  i = 0;
  start = performance.now();
  while (i < len) {
    val = bigintSquares[i++] / bigints[i++];
  }
  time = performance.now() - start;
  postMessage(`BigInt division, ${digs} digs, ${trialCount} trials: ${time} ms, ${Math.floor(trialCount / time * 1000)} ops/sec`);

  // AP
  i = 0;
  start = performance.now();
  while (i < len) {
    ctx.div(tmp, aps[i++], aps[i++]);
  }
  time = performance.now() - start;
  postMessage(`AP division, ${digs} digs, ${trialCount} trials: ${time} ms, ${Math.floor(trialCount / time * 1000)} ops/sec`);

}