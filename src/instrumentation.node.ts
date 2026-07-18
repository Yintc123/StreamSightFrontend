// Spec 001h §3/§5.1/§6/§7 — node-only OpenTelemetry bootstrap (manual NodeSDK,
// per Next.js official OTel guide). Imported by instrumentation.ts's
// `NEXT_RUNTIME === 'nodejs'` branch. NodeSDK is chosen over @vercel/otel
// because the app is node-runtime only (no edge) and §7 needs the SDK handle
// to flush on Cloud Run SIGTERM.
//
// Only starts when an OTLP endpoint is configured, so dev / test / local
// without a collector stay silent (no exporter connection errors). Set
// OTEL_EXPORTER_OTLP_ENDPOINT (or ..._TRACES_ENDPOINT) to enable.

import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node'

import { registerOtelSdk } from './lib/observability/otel-sdk'
import { log } from './lib/log'

const endpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT

if (endpoint) {
  const isProd = process.env.NODE_ENV === 'production'

  // §6 — ParentBased(TraceIdRatioBased): honour upstream, ratio at the root.
  // env override, else prod 0.1 / dev 1.0.
  const ratioArg = process.env.OTEL_TRACES_SAMPLER_ARG
  const parsed = ratioArg != null && ratioArg !== '' ? Number(ratioArg) : NaN
  const ratio = Number.isFinite(parsed) ? parsed : isProd ? 0.1 : 1

  // §7 — Batch in prod (needs SIGTERM flush, wired via otel-sdk + lifecycle);
  // Simple in dev (immediate export, no flush concern).
  const exporter = new OTLPTraceExporter() // reads OTEL_EXPORTER_OTLP_* from env
  const spanProcessor = isProd
    ? new BatchSpanProcessor(exporter)
    : new SimpleSpanProcessor(exporter)

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'streamsight-bff',
    }),
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) }),
    spanProcessors: [spanProcessor],
  })

  sdk.start()
  registerOtelSdk(sdk)
  log.info({ ratio, prod: isProd }, 'bff.otel.started')
}
