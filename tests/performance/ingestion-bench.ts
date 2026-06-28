/**
 * Ingestion latency benchmark
 *
 * Measures how fast the Sentry-compatible ingestion endpoint processes events.
 * Target: < 10ms p95 ingestion latency.
 *
 * Run: bun run tests/performance/ingestion-bench.ts
 */

const BASE_URL = process.env.BENCH_URL || "http://localhost:8001";
const API_KEY = process.env.BENCH_API_KEY || "test-api-key";
const PROJECT_ID = process.env.BENCH_PROJECT_ID || "00000000-0000-0000-0000-000000000001";
const ITERATIONS = Number(process.env.BENCH_ITERATIONS) || 1000;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 10;

function makeSentryEvent(i: number) {
  return {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    message: `Benchmark event ${i}`,
    exception: {
      values: [
        {
          type: "BenchmarkError",
          value: `Error message ${i}`,
          stacktrace: {
            frames: [
              {
                filename: "src/main.ts",
                function: "processEvent",
                lineno: 42,
                in_app: true,
              },
              {
                filename: "node_modules/framework/index.js",
                function: "handleRequest",
                lineno: 100,
                in_app: false,
              },
            ],
          },
        },
      ],
    },
    tags: { benchmark: "true", iteration: String(i) },
    sdk: { name: "benchmark", version: "1.0.0" },
    timestamp: Date.now() / 1000,
  };
}

function calcPercentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

async function sendEvent(i: number): Promise<number> {
  const start = performance.now();
  const response = await fetch(`${BASE_URL}/api/${PROJECT_ID}/store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(makeSentryEvent(i)),
  });
  const elapsed = performance.now() - start;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return elapsed;
}

async function runBatch(batch: number[]): Promise<number[]> {
  return Promise.all(batch.map((i) => sendEvent(i)));
}

async function main() {
  console.log(`HiAi Observe Ingestion Benchmark`);
  console.log(`Target: ${BASE_URL}/api/${PROJECT_ID}/store`);
  console.log(`Iterations: ${ITERATIONS}, Concurrency: ${CONCURRENCY}`);
  console.log(`---`);

  // Warmup
  console.log("Warming up (10 requests)...");
  for (let i = 0; i < 10; i++) {
    await sendEvent(i);
  }

  // Benchmark
  console.log("Running benchmark...");
  const latencies: number[] = [];
  const benchStart = performance.now();

  for (let i = 0; i < ITERATIONS; i += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, ITERATIONS - i) }, (_, j) => i + j);
    const batchLatencies = await runBatch(batch);
    latencies.push(...batchLatencies);
  }

  const totalTime = performance.now() - benchStart;

  // Results
  latencies.sort((a, b) => a - b);
  const p50 = calcPercentile(latencies, 50);
  const p95 = calcPercentile(latencies, 95);
  const p99 = calcPercentile(latencies, 99);
  const min = latencies[0] ?? 0;
  const max = latencies[latencies.length - 1] ?? 0;
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const throughput = (ITERATIONS / totalTime) * 1000;

  console.log(`\nResults:`);
  console.log(`  Total time: ${totalTime.toFixed(0)}ms`);
  console.log(`  Throughput: ${throughput.toFixed(0)} req/s`);
  console.log(`  Latency:`);
  console.log(`    min:  ${min.toFixed(2)}ms`);
  console.log(`    avg:  ${avg.toFixed(2)}ms`);
  console.log(`    p50:  ${p50.toFixed(2)}ms`);
  console.log(`    p95:  ${p95.toFixed(2)}ms`);
  console.log(`    p99:  ${p99.toFixed(2)}ms`);
  console.log(`    max:  ${max.toFixed(2)}ms`);
  console.log(
    `\nTarget check: p95 = ${p95.toFixed(2)}ms ${p95 < 10 ? "PASS (< 10ms)" : "FAIL (>= 10ms)"}`,
  );

  process.exit(p95 < 10 ? 0 : 1);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
