/**
 * OTLP protobuf schema bundle for protobufjs.
 *
 * Based on OpenTelemetry proto definitions (Apache-2.0):
 * https://github.com/open-telemetry/opentelemetry-proto
 *
 * We embed a JSON-schema bundle here (instead of loading .proto files at
 * runtime) so the server has no .proto parser dependency, starts fast, and
 * stays small for <512MB RAM targets.
 *
 * Covers: traces v1 + metrics v1 + logs v1 + their common/resource dependencies.
 * Profiles are intentionally NOT included — out of MVP scope.
 */
export const OTLP_PROTO_SCHEMA_JSON = JSON.stringify({
  nested: {
    opentelemetry: {
      nested: {
        proto: {
          nested: {
            common: {
              nested: {
                v1: {
                  nested: {
                    AnyValue: {
                      fields: {
                        stringValue: { type: "string", id: 1 },
                        boolValue: { type: "bool", id: 2 },
                        intValue: { type: "int64", id: 3 },
                        doubleValue: { type: "double", id: 4 },
                        arrayValue: { type: "ArrayValue", id: 5 },
                        kvlistValue: { type: "KeyValueList", id: 6 },
                        bytesValue: { type: "bytes", id: 7 },
                      },
                    },
                    ArrayValue: {
                      fields: {
                        values: { rule: "repeated", type: "AnyValue", id: 1 },
                      },
                    },
                    KeyValue: {
                      fields: {
                        key: { type: "string", id: 1 },
                        value: { type: "AnyValue", id: 2 },
                      },
                    },
                    KeyValueList: {
                      fields: {
                        values: { rule: "repeated", type: "KeyValue", id: 1 },
                      },
                    },
                    InstrumentationScope: {
                      fields: {
                        name: { type: "string", id: 1 },
                        version: { type: "string", id: 2 },
                        attributes: { rule: "repeated", type: "KeyValue", id: 3 },
                        droppedAttributesCount: { type: "uint32", id: 4 },
                      },
                    },
                  },
                },
              },
            },
            resource: {
              nested: {
                v1: {
                  nested: {
                    Resource: {
                      fields: {
                        attributes: { rule: "repeated", type: "KeyValue", id: 1 },
                        droppedAttributesCount: { type: "uint32", id: 2 },
                      },
                    },
                  },
                },
              },
            },
            trace: {
              nested: {
                v1: {
                  nested: {
                    TracesData: {
                      fields: {
                        resourceSpans: { rule: "repeated", type: "ResourceSpans", id: 1 },
                      },
                    },
                    ResourceSpans: {
                      fields: {
                        resource: { type: "Resource", id: 1 },
                        scopeSpans: { rule: "repeated", type: "ScopeSpans", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    ScopeSpans: {
                      fields: {
                        scope: { type: "InstrumentationScope", id: 1 },
                        spans: { rule: "repeated", type: "Span", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    Span: {
                      fields: {
                        traceId: { type: "bytes", id: 1 },
                        spanId: { type: "bytes", id: 2 },
                        traceState: { type: "string", id: 3 },
                        parentSpanId: { type: "bytes", id: 4 },
                        flags: { type: "uint32", id: 16 },
                        name: { type: "string", id: 5 },
                        kind: { type: "SpanKind", id: 6 },
                        startTimeUnixNano: { type: "uint64", id: 7 },
                        endTimeUnixNano: { type: "uint64", id: 8 },
                        attributes: { rule: "repeated", type: "KeyValue", id: 9 },
                        droppedAttributesCount: { type: "uint32", id: 10 },
                        events: { rule: "repeated", type: "Event", id: 11 },
                        droppedEventsCount: { type: "uint32", id: 12 },
                        links: { rule: "repeated", type: "Link", id: 13 },
                        droppedLinksCount: { type: "uint32", id: 14 },
                        status: { type: "Status", id: 15 },
                      },
                      nested: {
                        Event: {
                          fields: {
                            timeUnixNano: { type: "uint64", id: 1 },
                            name: { type: "string", id: 2 },
                            attributes: { rule: "repeated", type: "KeyValue", id: 3 },
                            droppedAttributesCount: { type: "uint32", id: 4 },
                          },
                        },
                        Link: {
                          fields: {
                            traceId: { type: "bytes", id: 1 },
                            spanId: { type: "bytes", id: 2 },
                            traceState: { type: "string", id: 3 },
                            attributes: { rule: "repeated", type: "KeyValue", id: 4 },
                            droppedAttributesCount: { type: "uint32", id: 5 },
                            flags: { type: "uint32", id: 6 },
                          },
                        },
                      },
                    },
                    SpanKind: {
                      values: {
                        SPAN_KIND_UNSPECIFIED: 0,
                        SPAN_KIND_INTERNAL: 1,
                        SPAN_KIND_SERVER: 2,
                        SPAN_KIND_CLIENT: 3,
                        SPAN_KIND_PRODUCER: 4,
                        SPAN_KIND_CONSUMER: 5,
                      },
                    },
                    Status: {
                      fields: {
                        message: { type: "string", id: 2 },
                        code: { type: "StatusCode", id: 3 },
                      },
                    },
                    StatusCode: {
                      values: {
                        STATUS_CODE_UNSET: 0,
                        STATUS_CODE_OK: 1,
                        STATUS_CODE_ERROR: 2,
                      },
                    },
                  },
                },
              },
            },
            metrics: {
              nested: {
                v1: {
                  nested: {
                    MetricsData: {
                      fields: {
                        resourceMetrics: {
                          rule: "repeated",
                          type: "ResourceMetrics",
                          id: 1,
                        },
                      },
                    },
                    ResourceMetrics: {
                      fields: {
                        resource: { type: "Resource", id: 1 },
                        scopeMetrics: { rule: "repeated", type: "ScopeMetrics", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    ScopeMetrics: {
                      fields: {
                        scope: { type: "InstrumentationScope", id: 1 },
                        metrics: { rule: "repeated", type: "Metric", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    Metric: {
                      oneofs: {
                        data: {
                          oneof: ["sum", "gauge", "histogram", "exponentialHistogram", "summary"],
                        },
                      },
                      fields: {
                        name: { type: "string", id: 1 },
                        description: { type: "string", id: 2 },
                        unit: { type: "string", id: 3 },
                        sum: { type: "Sum", id: 5 },
                        gauge: { type: "Gauge", id: 6 },
                        histogram: { type: "Histogram", id: 7 },
                        exponentialHistogram: { type: "ExponentialHistogram", id: 8 },
                        summary: { type: "Summary", id: 9 },
                      },
                      nested: {
                        Sum: {
                          fields: {
                            dataPoints: { rule: "repeated", type: "NumberDataPoint", id: 1 },
                            aggregationTemporality: { type: "AggregationTemporality", id: 2 },
                            isMonotonic: { type: "bool", id: 3 },
                          },
                        },
                        Gauge: {
                          fields: {
                            dataPoints: { rule: "repeated", type: "NumberDataPoint", id: 1 },
                          },
                        },
                        Histogram: {
                          fields: {
                            dataPoints: { rule: "repeated", type: "HistogramDataPoint", id: 1 },
                            aggregationTemporality: { type: "AggregationTemporality", id: 2 },
                          },
                        },
                        ExponentialHistogram: {
                          fields: {
                            dataPoints: {
                              rule: "repeated",
                              type: "ExponentialHistogramDataPoint",
                              id: 1,
                            },
                            aggregationTemporality: {
                              type: "AggregationTemporality",
                              id: 2,
                            },
                          },
                        },
                        Summary: {
                          fields: {
                            dataPoints: { rule: "repeated", type: "SummaryDataPoint", id: 1 },
                          },
                        },
                      },
                    },
                    NumberDataPoint: {
                      fields: {
                        attributes: { rule: "repeated", type: "KeyValue", id: 7 },
                        startTimeUnixNano: { type: "uint64", id: 2 },
                        timeUnixNano: { type: "uint64", id: 3 },
                        asInt: { type: "int64", id: 4 },
                        asDouble: { type: "double", id: 5 },
                        exemplars: { rule: "repeated", type: "Exemplar", id: 6 },
                        flags: { type: "uint32", id: 8 },
                      },
                      oneofs: {
                        value: { oneof: ["asInt", "asDouble"] },
                      },
                    },
                    HistogramDataPoint: {
                      fields: {
                        attributes: { rule: "repeated", type: "KeyValue", id: 9 },
                        startTimeUnixNano: { type: "uint64", id: 2 },
                        timeUnixNano: { type: "uint64", id: 3 },
                        count: { type: "uint64", id: 4 },
                        sum: { type: "double", id: 5 },
                        bucketCounts: { rule: "repeated", type: "uint64", id: 6 },
                        explicitBounds: { rule: "repeated", type: "double", id: 7 },
                        exemplars: { rule: "repeated", type: "Exemplar", id: 8 },
                        flags: { type: "uint32", id: 10 },
                        min: { type: "double", id: 11 },
                        max: { type: "double", id: 12 },
                      },
                    },
                    ExponentialHistogramDataPoint: {
                      fields: {
                        attributes: { rule: "repeated", type: "KeyValue", id: 1 },
                        startTimeUnixNano: { type: "uint64", id: 2 },
                        timeUnixNano: { type: "uint64", id: 3 },
                        count: { type: "uint64", id: 4 },
                        min: { type: "double", id: 5 },
                        max: { type: "double", id: 6 },
                        scale: { type: "sint32", id: 7 },
                        zeroCount: { type: "uint64", id: 8 },
                        positive: { type: "Buckets", id: 9 },
                        negative: { type: "Buckets", id: 10 },
                        flags: { type: "uint32", id: 11 },
                        exemplars: { rule: "repeated", type: "Exemplar", id: 12 },
                      },
                      nested: {
                        Buckets: {
                          fields: {
                            offset: { type: "sint32", id: 1 },
                            bucketCounts: { rule: "repeated", type: "uint64", id: 2 },
                          },
                        },
                      },
                    },
                    SummaryDataPoint: {
                      fields: {
                        attributes: { rule: "repeated", type: "KeyValue", id: 7 },
                        startTimeUnixNano: { type: "uint64", id: 2 },
                        timeUnixNano: { type: "uint64", id: 3 },
                        count: { type: "uint64", id: 4 },
                        sum: { type: "double", id: 5 },
                        quantileValues: {
                          rule: "repeated",
                          type: "ValueAtQuantile",
                          id: 6,
                        },
                        flags: { type: "uint32", id: 8 },
                      },
                      nested: {
                        ValueAtQuantile: {
                          fields: {
                            quantile: { type: "double", id: 1 },
                            value: { type: "double", id: 2 },
                          },
                        },
                      },
                    },
                    Exemplar: {
                      fields: {
                        filteredAttributes: { rule: "repeated", type: "KeyValue", id: 7 },
                        timeUnixNano: { type: "uint64", id: 2 },
                        asInt: { type: "int64", id: 3 },
                        asDouble: { type: "double", id: 4 },
                        spanId: { type: "bytes", id: 5 },
                        traceId: { type: "bytes", id: 6 },
                      },
                      oneofs: {
                        value: { oneof: ["asInt", "asDouble"] },
                      },
                    },
                    AggregationTemporality: {
                      values: {
                        AGGREGATION_TEMPORALITY_UNSPECIFIED: 0,
                        AGGREGATION_TEMPORALITY_DELTA: 1,
                        AGGREGATION_TEMPORALITY_CUMULATIVE: 2,
                      },
                    },
                  },
                },
              },
            },
            logs: {
              nested: {
                v1: {
                  nested: {
                    LogsData: {
                      fields: {
                        resourceLogs: { rule: "repeated", type: "ResourceLogs", id: 1 },
                      },
                    },
                    ResourceLogs: {
                      fields: {
                        resource: { type: "Resource", id: 1 },
                        scopeLogs: { rule: "repeated", type: "ScopeLogs", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    ScopeLogs: {
                      fields: {
                        scope: { type: "InstrumentationScope", id: 1 },
                        logRecords: { rule: "repeated", type: "LogRecord", id: 2 },
                        schemaUrl: { type: "string", id: 3 },
                      },
                    },
                    LogRecord: {
                      fields: {
                        timeUnixNano: { type: "uint64", id: 1 },
                        observedTimeUnixNano: { type: "uint64", id: 11 },
                        severityNumber: { type: "SeverityNumber", id: 2 },
                        severityText: { type: "string", id: 3 },
                        // Body is AnyValue (oneof-style, but no `oneof` block in proto3
                        // when the field is just a message — protobufjs accepts it as plain).
                        body: { type: "AnyValue", id: 5 },
                        attributes: { rule: "repeated", type: "KeyValue", id: 6 },
                        droppedAttributesCount: { type: "uint32", id: 7 },
                        // traceId/spanId are optional in OTLP log records.
                        traceId: { type: "bytes", id: 8 },
                        spanId: { type: "bytes", id: 9 },
                        flags: { type: "uint32", id: 10 },
                      },
                    },
                    SeverityNumber: {
                      values: {
                        SEVERITY_NUMBER_UNSPECIFIED: 0,
                        SEVERITY_NUMBER_TRACE: 1,
                        SEVERITY_NUMBER_TRACE2: 2,
                        SEVERITY_NUMBER_TRACE3: 3,
                        SEVERITY_NUMBER_TRACE4: 4,
                        SEVERITY_NUMBER_DEBUG: 5,
                        SEVERITY_NUMBER_DEBUG2: 6,
                        SEVERITY_NUMBER_DEBUG3: 7,
                        SEVERITY_NUMBER_DEBUG4: 8,
                        SEVERITY_NUMBER_INFO: 9,
                        SEVERITY_NUMBER_INFO2: 10,
                        SEVERITY_NUMBER_INFO3: 11,
                        SEVERITY_NUMBER_INFO4: 12,
                        SEVERITY_NUMBER_WARN: 13,
                        SEVERITY_NUMBER_WARN2: 14,
                        SEVERITY_NUMBER_WARN3: 15,
                        SEVERITY_NUMBER_WARN4: 16,
                        SEVERITY_NUMBER_ERROR: 17,
                        SEVERITY_NUMBER_ERROR2: 18,
                        SEVERITY_NUMBER_ERROR3: 19,
                        SEVERITY_NUMBER_ERROR4: 20,
                        SEVERITY_NUMBER_FATAL: 21,
                        SEVERITY_NUMBER_FATAL2: 22,
                        SEVERITY_NUMBER_FATAL3: 23,
                        SEVERITY_NUMBER_FATAL4: 24,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
