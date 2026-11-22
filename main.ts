import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Tiny stack VM for make.fun's tiny-stack-vm-01. [byte, imm bytes, popped, pushed].
const S: [number, number, number, number][] = [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0], [4, 0, 1, 2], [5, 0, 2, 2],
  [6, 0, 2, 3], [7, 0, 3, 3], [16, 0, 2, 1], [17, 0, 2, 1], [18, 0, 2, 1], [19, 0, 2, 1],
  [20, 0, 2, 1], [21, 0, 2, 1], [22, 0, 2, 1], [23, 0, 1, 1], [24, 0, 2, 1], [25, 0, 2, 1],
  [26, 0, 2, 1], [27, 0, 1, 1], [28, 0, 2, 1], [29, 0, 2, 1], [30, 0, 2, 1], [32, 0, 2, 1],
  [33, 0, 2, 1], [34, 0, 2, 1], [48, 2, 0, 0], [49, 2, 1, 0], [50, 2, 1, 0], [51, 2, 0, 0],
  [52, 0, 0, 0], [64, 0, 1, 1], [65, 0, 2, 0], [80, 0, 1, 0], [81, 0, 1, 0], [82, 0, 0, 1],
  [83, 0, 1, 0],
];
const T: ([number, number, number] | undefined)[] = new Array(256);
for (const [o, i, p, q] of S) T[o] = [i, p, q];

const enc = new TextEncoder();
// A trap ends the run at once: throw the exit code, catch it in run().
const halt = (code: number): never => { throw code; };

function run(code: Uint8Array, input: Uint8Array): [Uint8Array, number] {
  const vals = new Int32Array(256);
  let top = 0;
  const rets = new Int32Array(64);
  let depth = 0;
  const cells = new Int32Array(256);
  const sink: number[] = [];
  let cursor = 0, at = 0, count = 0;
  try {
    for (;;) {
      if (count === 1000000) halt(10);
      if (at < 0 || at >= code.length) halt(9);
      const op = code[at], spec = T[op];
      if (spec === undefined) halt(5);
      const [imm, pops, pushes] = spec;
      if (at + imm >= code.length) halt(9);
      count++;
      const next = at + 1 + imm;
      if (top < pops) halt(2);
      if (top - pops + pushes > 256) halt(3);
      at = next;
      switch (op) {
      case 0: halt(0);
      case 1: vals[top++] = (code[next - 1] << 24) >> 24; break;
      case 2: vals[top++] = code[next - 4] | (code[next - 3] << 8) | (code[next - 2] << 16) | (code[next - 1] << 24); break;
      case 3: top--; break;
      case 4: vals[top] = vals[top - 1]; top++; break;
      case 5: { const t = vals[top - 1]; vals[top - 1] = vals[top - 2]; vals[top - 2] = t; break; }
      case 6: vals[top] = vals[top - 2]; top++; break;
      case 7: { const a = vals[top - 3]; vals[top - 3] = vals[top - 2]; vals[top - 2] = vals[top - 1]; vals[top - 1] = a; break; }
      case 23: vals[top - 1] = -vals[top - 1] | 0; break;
      case 27: vals[top - 1] = ~vals[top - 1]; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22: case 24: case 25: case 26:
      case 28: case 29: case 30: case 32: case 33: case 34: {
        const b = vals[top - 1], a = vals[top - 2];
        let r: number;
        switch (op) {
          case 16: r = (a + b) | 0; break;
          case 17: r = (a - b) | 0; break;
          case 18: r = Math.imul(a, b); break;
          case 19: if (b === 0) halt(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; break;
          case 20: if (b === 0) halt(4); r = b === -1 ? 0 : (a % b) | 0; break;
          case 21: if (b === 0) halt(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break;
          case 22: if (b === 0) halt(4); r = ((a >>> 0) % (b >>> 0)) | 0; break;
          case 24: r = a & b; break;
          case 25: r = a | b; break;
          case 26: r = a ^ b; break;
          case 28: r = a << (b & 31); break;
          case 29: r = a >> (b & 31); break;
          case 30: r = (a >>> (b & 31)) | 0; break;
          case 32: r = a === b ? 1 : 0; break;
          case 33: r = a < b ? 1 : 0; break;
          default: r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        }
        top -= 2; vals[top++] = r; break;
      }
      case 48: case 49: case 50: {
        const off = ((code[next - 2] | (code[next - 1] << 8)) << 16) >> 16;
        let go = op === 48;
        if (op !== 48) { const v = vals[--top]; go = op === 49 ? v === 0 : v !== 0; }
        if (go) at = next + off;
        break;
      }
      case 51:
        if (depth === 64) halt(7);
        rets[depth++] = next; at = code[next - 2] | (code[next - 1] << 8); break;
      case 52:
        if (depth === 0) halt(8);
        at = rets[--depth]; break;
      case 64: { const addr = vals[top - 1]; if (addr < 0 || addr >= 256) halt(6); vals[top - 1] = cells[addr]; break; }
      case 65: {
        const addr = vals[top - 1], v = vals[top - 2];
        if (addr < 0 || addr >= 256) halt(6);
        top -= 2; cells[addr] = v; break;
      }
      case 80: {
        const bs = enc.encode(String(vals[top - 1]));
        if (sink.length + bs.length > 65536) halt(11);
        top--;
        for (const b of bs) sink.push(b);
        break;
      }
      case 81:
        if (sink.length + 1 > 65536) halt(11);
        sink.push(vals[--top] & 255); break;
      case 82: vals[top++] = cursor < input.length ? input[cursor++] : -1; break;
      case 83: halt(vals[--top] & 255);
    }
    }
  } catch (e) {
    if (typeof e === 'number') return [new Uint8Array(sink), e];
    throw e;
  }
  return [new Uint8Array(sink), 0];
}

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(IN_DIR).sort()) {
  const prog = new Uint8Array(readFileSync(join(IN_DIR, id, 'program.bin')));
  const data = new Uint8Array(readFileSync(join(IN_DIR, id, 'input.bin')));
  const [stdout, code] = run(prog, data);
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), stdout);
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), code + '\n');
}
