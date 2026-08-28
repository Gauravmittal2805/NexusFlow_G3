/**
 * ruleCompiler.js
 *
 * Compiles a React Flow rule graph into an RxJS-based execution pipeline.
 *
 * Pipeline compilation stages
 * ───────────────────────────
 *   1. Parse            – extract nodes and edges from the rule document
 *   2. Validate         – run graphValidator to catch structural errors early
 *   3. Build Node Map   – index nodes by ID for O(1) lookup
 *   4. Build Edge Map   – index outgoing edges by source node ID  (Step 5)
 *   5. Build Exec Order – topological sort using edges  (Step 6)
 *   6. Build RxJS pipe  – map each node type to its RxJS operator  (Step 8)
 *   7. Expose API       – compileRule() returns { run(telemetry$), runOnce(telemetry) }
 *
 * RxJS architecture (Step 8)
 * ──────────────────────────
 *
 *   Member 1 supplies:          telemetry$   (Observable<TelemetryReading>)
 *                                               │
 *   Sensor node    → from() / of()  ◄───────────┘  source
 *         ↓
 *   Condition node → filter()                       gate
 *         ↓
 *   Math node      → map()                          transform  (optional)
 *         ↓
 *   Alert node     → tap()  (inside subscribe)      sink
 *
 * Public API
 * ──────────
 *   compileRule(rule)
 *     Compiles and returns a CompiledPipeline.  Throws CompilationError on
 *     invalid graphs.  Safe to call at server start-up time.
 *
 *   CompiledPipeline shape:
 *   {
 *     ruleId:         string,
 *     ruleName:       string,
 *     executionOrder: string[],          // ordered node IDs  (Step 6)
 *     nodeMap:        Map<id, node>,     // Step 3
 *     edgeMap:        Map<id, id[]>,     // Step 5: source → [targets]
 *     run(telemetry$): Subscription      // Step 11: connect to live Observable
 *     runOnce(telemetry): PipelineResult // Step 9: synchronous single-shot test
 *   }
 *
 * PipelineResult (from runOnce):
 *   {
 *     matched:   boolean,
 *     ruleId:    string,
 *     ruleName:  string,
 *     sensorId:  string,
 *     context:   Object,
 *     stoppedAt: string | null,
 *     reason:    string | null,
 *     outputs:   Array<{ nodeId, type, output }>
 *   }
 *
 * Step 11 — Not connected to live telemetry yet
 * ──────────────────────────────────────────────
 * run(telemetry$) is designed to receive an Observable from Member 1 but is
 * NOT wired to any live data source here.  The connection will be made once
 * both modules are ready.  runOnce(telemetry) is used for testing today.
 *
 * Step 13 — Expected telemetry shape from Member 1
 * ─────────────────────────────────────────────────
 *   {
 *     sensorId:    string,
 *     timestamp:   string | Date,
 *     temperature: number,
 *     pressure:    number,
 *     humidity:    number,
 *     rpm:         number
 *   }
 */

const { from, of, Observable } = require('rxjs');
const { filter, map, tap, catchError, takeUntil } = require('rxjs/operators');
const { Subject } = require('rxjs');

const { validateGraph } = require('./graphValidator');
const { getHandler }    = require('./nodeHandlers');

// ── Custom error type ─────────────────────────────────────────────────────────

class CompilationError extends Error {
  /**
   * @param {string}   message - Human-readable summary
   * @param {string[]} errors  - Individual validation error messages
   */
  constructor(message, errors = []) {
    super(message);
    this.name   = 'CompilationError';
    this.errors = errors;
  }
}

// ── Stage 1: Parse ────────────────────────────────────────────────────────────

/**
 * Extracts and normalises nodes and edges from a rule document.
 * Accepts both Mongoose documents (.toObject()) and plain objects.
 *
 * @param {Object} rule
 * @returns {{ ruleId: string, ruleName: string, nodes: Array, edges: Array }}
 */
function parseGraph(rule) {
  const doc = typeof rule.toObject === 'function' ? rule.toObject() : rule;

  return {
    ruleId:   doc._id ? String(doc._id) : doc.id || 'unknown',
    ruleName: doc.name || 'Unnamed Rule',
    nodes:    Array.isArray(doc.nodes) ? doc.nodes : [],
    edges:    Array.isArray(doc.edges) ? doc.edges : [],
  };
}

// ── Stage 3: Build Node Map ───────────────────────────────────────────────────

/**
 * Indexes nodes by their ID for O(1) access during pipeline execution.
 *
 * Visualisation:
 *   "sensor1"    → { id, type: 'sensor',    data: { sensorId, field } }
 *   "condition1" → { id, type: 'condition', data: { field, operator, value } }
 *   "alert1"     → { id, type: 'alert',     data: { action, severity } }
 *
 * @param {Array} nodes
 * @returns {Map<string, Object>}
 */
function buildNodeMap(nodes) {
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return nodeMap;
}

// ── Stage 4: Build Edge Map  (Step 5) ────────────────────────────────────────

/**
 * Indexes outgoing edges by source node ID.
 *
 * This makes it possible to determine the execution flow directly from the
 * React Flow graph rather than relying on the order of the nodes array.
 *
 * Visualisation (Step 5):
 *   "sensor1"    → ["condition1"]
 *   "condition1" → ["alert1"]
 *   "alert1"     → []              (sink — no outgoing edges)
 *
 * Used by buildExecutionOrder to traverse the graph edge-by-edge.
 *
 * @param {Array} edges - Array of { source: string, target: string }
 * @returns {Map<string, string[]>} source node ID → array of target node IDs
 */
function buildEdgeMap(edges) {
  const edgeMap = new Map();

  for (const edge of edges) {
    if (!edge.source || !edge.target) continue;

    if (!edgeMap.has(edge.source)) {
      edgeMap.set(edge.source, []);
    }
    edgeMap.get(edge.source).push(edge.target);
  }

  return edgeMap;
}

// ── Stage 5: Build Execution Order  (Step 6) ─────────────────────────────────

/**
 * Derives a topologically sorted execution order from the graph.
 *
 * Algorithm: Kahn's BFS-based topological sort.
 *   - Source nodes (no incoming edges) are processed first.
 *   - A node is only processed once all its predecessors have been processed.
 *   - Cycle detection: remaining nodes after the sort indicate a cycle.
 *
 * Within each BFS level, nodes are ordered by type priority to ensure the
 * canonical execution sequence regardless of array ordering:
 *   sensor → condition → math → alert / filter
 *
 * Example result for sensor1 → condition1 → alert1:
 *   ['sensor1', 'condition1', 'alert1']
 *
 * @param {Array}  nodes
 * @param {Array}  edges
 * @param {Map}    nodeMap
 * @returns {string[]} Ordered list of node IDs (source → sink)
 * @throws {CompilationError} if the graph contains a cycle
 */
function buildExecutionOrder(nodes, edges, nodeMap) {
  const adjList  = new Map(); // nodeId → [targetId, ...]
  const inDegree = new Map(); // nodeId → number of incoming edges

  for (const node of nodes) {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!adjList.has(edge.source) || !adjList.has(edge.target)) continue;
    adjList.get(edge.source).push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const TYPE_PRIORITY = {
    sensor: 0, sensorNode: 0,
    condition: 1, conditionNode: 1,
    math: 2, mathNode: 2,
    filter: 2,
    alert: 3, alertNode: 3,
    action: 3, actionNode: 3,
  };

  const priority = (id) => {
    const node = nodeMap.get(id);
    return node ? (TYPE_PRIORITY[node.type] ?? 99) : 99;
  };

  const queue = [];
  const order = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }
  queue.sort((a, b) => priority(a) - priority(b));

  while (queue.length > 0) {
    const current    = queue.shift();
    order.push(current);
    const neighbours = adjList.get(current) || [];
    const readyNext  = [];

    for (const neighbour of neighbours) {
      const newDegree = inDegree.get(neighbour) - 1;
      inDegree.set(neighbour, newDegree);
      if (newDegree === 0) readyNext.push(neighbour);
    }

    readyNext.sort((a, b) => priority(a) - priority(b));
    queue.push(...readyNext);
  }

  if (order.length !== nodes.length) {
    throw new CompilationError(
      'Rule graph contains a cycle and cannot be compiled.',
      ['Cycle detected: not all nodes could be topologically ordered.']
    );
  }

  return order;
}

// ── Stage 6: Build RxJS Operator Pipe  (Step 8) ──────────────────────────────

/**
 * Maps each node in the execution order to its corresponding RxJS operator
 * and returns a list of pipeable operators ready for use with Observable.pipe().
 *
 * RxJS operator mapping:
 *   sensor    → (handled at source — the Observable itself)
 *   condition → filter()    gate: drops readings that fail the threshold
 *   math      → map()       transform: applies arithmetic, mutates field value
 *   alert     → tap()       sink side-effect: sets context.alertAction/Severity
 *   filter    → filter()    windowing stub: always passes through for now
 *
 * The sensor node is the Observable source, not a pipeable operator, so it is
 * handled in run()/runOnce() rather than here.
 *
 * @param {string[]}           executionOrder
 * @param {Map<string,Object>} nodeMap
 * @param {string}             ruleId
 * @param {string}             ruleName
 * @returns {Function[]} Array of RxJS pipeable operator functions
 */
function buildRxjsPipe(executionOrder, nodeMap, ruleId, ruleName) {
  const operators = [];

  for (const nodeId of executionOrder) {
    const node    = nodeMap.get(nodeId);
    if (!node) continue;

    const handler = getHandler(node.type);
    if (!handler) continue;

    switch (node.type) {

      // ── Sensor: source — not a pipeable operator, skip here ─────────────
      case 'sensor':
      case 'sensorNode':
        // The sensor handler is called once at the source (see run / runOnce).
        // Its only pipeline role is to validate sensorId match and populate
        // context.matchedField for downstream nodes.
        operators.push(
          filter((packet) => {
            const result = handler(node, packet.telemetry, packet.context);
            // Always record the output so outputs[] has one entry per node
            packet.outputs.push({ nodeId, type: node.type, output: result.output ?? null });
            return result.pass;
          })
        );
        break;

      // ── Condition: filter() — gate ───────────────────────────────────────
      case 'condition':
      case 'conditionNode':
        operators.push(
          filter((packet) => {
            const result = handler(node, packet.telemetry, packet.context);
            packet.outputs.push({ nodeId, type: node.type, output: result.output ?? null });
            return result.pass;
          })
        );
        break;

      // ── Math: map() — transform ──────────────────────────────────────────
      case 'math':
      case 'mathNode':
        operators.push(
          map((packet) => {
            const result = handler(node, packet.telemetry, packet.context);
            packet.outputs.push({ nodeId, type: node.type, output: result.output ?? null });
            // If the math node fails (e.g. missing field), mark the packet so
            // a downstream filter can drop it
            if (!result.pass) {
              packet.blocked    = true;
              packet.stoppedAt  = nodeId;
              packet.reason     = result.reason;
            }
            return packet;
          }),
          // Drop packets that were blocked by the math node
          filter((packet) => !packet.blocked)
        );
        break;

      // ── Alert: tap() — sink side-effect ─────────────────────────────────
      case 'alert':
      case 'alertNode':
      case 'action':
      case 'actionNode':
        operators.push(
          tap((packet) => {
            const result = handler(node, packet.telemetry, packet.context);
            packet.outputs.push({ nodeId, type: node.type, output: result.output ?? null });
            packet.matched = true;
          })
        );
        break;

      // ── Filter (windowing stub): filter() ───────────────────────────────
      case 'filter':
        operators.push(
          filter((packet) => {
            const result = handler(node, packet.telemetry, packet.context);
            packet.outputs.push({ nodeId, type: node.type, output: result.output ?? null });
            return result.pass;
          })
        );
        break;

      default:
        // Unknown types are skipped — graphValidator would have caught them
        break;
    }
  }

  // Append a catch-error safety net so a thrown exception never kills the stream
  operators.push(
    catchError((err, source) => {
      console.error(`[RuleCompiler] Stream error in rule '${ruleName}':`, err.message);
      return source; // resubscribe / continue
    })
  );

  return operators;
}

// ── Stage 7: runOnce — synchronous single-shot execution  (Step 9) ───────────

/**
 * Executes the compiled pipeline synchronously against a single telemetry
 * reading.  Used for unit testing (Step 14) and for the existing
 * ruleEngineService integration.
 *
 * Reads the execution order node-by-node, calling each handler in sequence.
 * Halts at the first node that returns { pass: false }.
 *
 * @param {string[]}           executionOrder
 * @param {Map<string,Object>} nodeMap
 * @param {string}             ruleId
 * @param {string}             ruleName
 * @param {Object}             telemetry
 * @returns {PipelineResult}
 */
function runOnce(executionOrder, nodeMap, ruleId, ruleName, telemetry) {
  const context   = {};
  const outputs   = [];
  let stoppedAt   = null;
  let stopReason  = null;

  for (const nodeId of executionOrder) {
    const node    = nodeMap.get(nodeId);
    const handler = node ? getHandler(node.type) : null;

    if (!handler) continue; // defensive — validator already blocked unknowns

    const result = handler(node, telemetry, context);
    outputs.push({ nodeId, type: node.type, output: result.output ?? null });

    if (!result.pass) {
      stoppedAt  = nodeId;
      stopReason = result.reason || `Node '${nodeId}' blocked the pipeline.`;
      break;
    }
  }

  return {
    matched:   stoppedAt === null,
    ruleId,
    ruleName,
    sensorId:  telemetry.sensorId || 'unknown',
    context,
    stoppedAt,
    reason:    stopReason,
    outputs,
  };
}

// ── Stage 7: run — RxJS Observable consumer  (Step 10 / Step 11) ─────────────

/**
 * Wires the compiled RxJS operator pipe to an Observable of telemetry readings.
 *
 * Architecture (Step 11 — not connected to live telemetry yet):
 *
 *   Member 1 provides:  telemetry$  Observable<{ sensorId, timestamp, ... }>
 *                             │
 *   compileRule()             ▼
 *   compiled.run(telemetry$) ──► subscription (active pipeline)
 *
 * Each emission from telemetry$ is wrapped in a packet object:
 *   { telemetry, context: {}, outputs: [], matched: false, blocked: false }
 *
 * and threaded through the RxJS pipe built from the rule graph.
 *
 * Calling run() returns a Subscription.  The caller is responsible for
 * unsubscribing when the rule is deactivated or the server shuts down.
 *
 * @param {Function[]}         rxPipe      - Operators from buildRxjsPipe()
 * @param {string}             ruleId
 * @param {string}             ruleName
 * @param {Observable}         telemetry$  - Observable from Member 1
 * @param {Function}           [onMatch]   - Optional callback(PipelineResult)
 * @returns {import('rxjs').Subscription}
 */
function run(rxPipe, ruleId, ruleName, telemetry$, onMatch) {
  if (!telemetry$ || typeof telemetry$.pipe !== 'function') {
    throw new TypeError(
      `[RuleCompiler] run() expects an RxJS Observable as telemetry$. ` +
      `Received: ${typeof telemetry$}`
    );
  }

  // Wrap each raw telemetry emission in a mutable packet object
  const packetStream$ = telemetry$.pipe(
    map((telemetry) => ({
      telemetry: { ...telemetry }, // shallow clone so math transforms don't mutate the source
      context:   {},
      outputs:   [],
      matched:   false,
      blocked:   false,
      stoppedAt: null,
      reason:    null,
    })),
    // Apply every compiled operator in sequence
    ...rxPipe
  );

  return packetStream$.subscribe({
    next: (packet) => {
      if (packet.matched && typeof onMatch === 'function') {
        onMatch({
          matched:   true,
          ruleId,
          ruleName,
          sensorId:  packet.telemetry.sensorId || 'unknown',
          context:   packet.context,
          stoppedAt: null,
          reason:    null,
          outputs:   packet.outputs,
          telemetry: packet.telemetry,
        });
      }
    },
    error: (err) => {
      console.error(`[RuleCompiler] Unhandled stream error for rule '${ruleName}':`, err);
    },
  });
}

// ── Main Entry Point  (Step 10) ───────────────────────────────────────────────

/**
 * Compiles a React Flow rule graph into an executable RxJS pipeline.
 *
 * compileRule(rule)
 *   Rule JSON
 *       ↓
 *   compileRule()
 *       ↓
 *   Compiled Rule  { ruleId, ruleName, executionOrder, nodeMap, edgeMap, run, runOnce }
 *
 * @param {Object} rule - Rule document (Mongoose doc or plain object)
 * @returns {CompiledPipeline}
 * @throws {CompilationError} on invalid graph or cycle
 */
function compileRule(rule) {
  // Stage 1: Parse
  const { ruleId, ruleName, nodes, edges } = parseGraph(rule);

  // Stage 2: Validate
  const { valid, errors } = validateGraph({ nodes, edges });
  if (!valid) {
    throw new CompilationError(
      `Rule graph for '${ruleName}' failed validation with ${errors.length} error(s).`,
      errors
    );
  }

  // Stage 3: Node Map
  const nodeMap = buildNodeMap(nodes);

  // Stage 4: Edge Map  (Step 5)
  const edgeMap = buildEdgeMap(edges);

  // Stage 5: Execution Order  (Step 6)
  const executionOrder = buildExecutionOrder(nodes, edges, nodeMap);

  // Stage 6: RxJS operator pipe  (Step 8)
  const rxPipe = buildRxjsPipe(executionOrder, nodeMap, ruleId, ruleName);

  return {
    ruleId,
    ruleName,
    executionOrder,
    nodeMap,
    edgeMap,

    /**
     * Synchronous single-shot execution for testing  (Step 9).
     * Equivalent to calling evaluateRule() in the old ruleEvaluator.
     *
     * @param {Object} telemetry - Single telemetry reading
     * @returns {PipelineResult}
     */
    runOnce: (telemetry) =>
      runOnce(executionOrder, nodeMap, ruleId, ruleName, telemetry),

    /**
     * Wires the compiled pipeline to a live RxJS Observable  (Step 11).
     * Member 1 exposes telemetry$ — pass it here once both modules are ready.
     *
     * @param {Observable} telemetry$ - Observable<TelemetryReading>
     * @param {Function}   [onMatch]  - Called with PipelineResult each time the rule fires
     * @returns {Subscription}        - Call .unsubscribe() to stop the pipeline
     */
    run: (telemetry$, onMatch) =>
      run(rxPipe, ruleId, ruleName, telemetry$, onMatch),
  };
}

module.exports = {
  compileRule,
  CompilationError,
  // Internal stages exported individually for unit testing
  parseGraph,
  buildNodeMap,
  buildEdgeMap,
  buildExecutionOrder,
  buildRxjsPipe,
};
