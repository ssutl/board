import { dot, mulberry32, normalize } from "./math";

export interface KMeansResult {
  labels: number[];
  centroids: number[][];
}

export interface KMeansOptions {
  seed?: number;
  maxIter?: number;
}

export function nearest(point: number[], centroids: number[][]): { index: number; similarity: number } {
  let index = 0;
  let similarity = -Infinity;
  for (let c = 0; c < centroids.length; c++) {
    const s = dot(point, centroids[c]);
    if (s > similarity) {
      similarity = s;
      index = c;
    }
  }
  return { index, similarity };
}

/**
 * Spherical k-means: points and centroids are unit vectors and "nearest" means the
 * highest dot product (cosine similarity). It starts from seeded k-means++ picks,
 * so the same points, k and seed always give exactly the same result.
 */
export function kmeans(points: number[][], k: number, { seed = 1, maxIter = 100 }: KMeansOptions = {}): KMeansResult {
  if (!Number.isInteger(k) || k < 1 || k > points.length) throw new Error(`k must be between 1 and ${points.length}, got ${k}`);
  const random = mulberry32(seed);
  let centroids = initPlusPlus(points, k, random);
  const labels = new Array<number>(points.length).fill(-1);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      const best = nearest(points[i], centroids).index;
      if (best !== labels[i]) {
        labels[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
    centroids = recompute(points, labels, centroids);
  }
  return { labels, centroids };
}

const distance = (a: number[], b: number[]) => Math.max(0, 1 - dot(a, b));

// k-means++: each new start is picked with probability proportional to its squared
// distance from the starts so far, which spreads them out.
function initPlusPlus(points: number[][], k: number, random: () => number): number[][] {
  const starts = [points[Math.floor(random() * points.length)]];
  const d2 = points.map((p) => distance(p, starts[0]) ** 2);
  while (starts.length < k) {
    const total = d2.reduce((a, b) => a + b, 0);
    let pick = 0;
    if (total === 0) pick = Math.floor(random() * points.length);
    else {
      let r = random() * total;
      while (pick < points.length - 1 && (r -= d2[pick]) > 0) pick++;
    }
    starts.push(points[pick]);
    for (let i = 0; i < points.length; i++) d2[i] = Math.min(d2[i], distance(points[i], points[pick]) ** 2);
  }
  return starts.map((s) => s.slice());
}

function recompute(points: number[][], labels: number[], previous: number[][]): number[][] {
  const dim = points[0].length;
  const sums = previous.map(() => new Array<number>(dim).fill(0));
  const counts = new Array<number>(previous.length).fill(0);
  points.forEach((p, i) => {
    const sum = sums[labels[i]];
    for (let d = 0; d < dim; d++) sum[d] += p[d];
    counts[labels[i]]++;
  });

  const taken = new Set<number>();
  return sums.map((sum, c) => {
    if (counts[c] > 0) return normalize(sum);
    // An empty cluster restarts at the point that fits its current cluster worst.
    let worst = -1;
    let worstSimilarity = Infinity;
    points.forEach((p, i) => {
      const s = dot(p, previous[labels[i]]);
      if (!taken.has(i) && s < worstSimilarity) {
        worstSimilarity = s;
        worst = i;
      }
    });
    taken.add(worst);
    return points[worst].slice();
  });
}
