/**
 * ruleStreamManager.js
 *
 * Stream Manager for Rule Subscriptions (Member 1 Stream Infrastructure + Member 2 Rule Engine).
 *
 * Responsibilities:
 * ─────────────────
 * 1. Maintain in-memory mapping: Rule ID → RxJS Subscription (activeRuleSubscriptions).
 * 2. Subscribe compiled rule pipelines to live telemetry$ (subscribeRule).
 * 3. Unsubscribe rules when disabled or removed (unsubscribeRule).
 * 4. Prevent duplicate subscriptions for already active rules.
 * 5. Handle active rule lifecycle (Rule Created/Enabled -> Subscribe, Rule Disabled -> Unsubscribe).
 * 6. Support multiple sensors (TURBINE-001, TURBINE-002, TURBINE-003) on a unified stream
 *    without creating separate WebSocket connections.
 * 7. Provide runtime rule registry inspection & diagnostics.
 * 8. Connect Member 1's telemetry$ with Member 2's compiled pipelines.
 * 9. Handle clean server shutdown and resource cleanup.
 *
 * Architecture:
 * ─────────────
 *                    Incoming Telemetry
 *                            │
 *                            ▼
 *                   pushTelemetry(data)
 *                            │
 *                            ▼
 *                       telemetry$  (Shared Hot Observable)
 *                            │
 *           ┌────────────────┼────────────────┐
 *           ↓                ↓                ↓
 *     Rule 1 (Sub A)   Rule 2 (Sub B)   Rule 3 (Sub C)
 *      TURBINE-001      TURBINE-002      TURBINE-003
 */

'use strict';

const { telemetry$, pushTelemetry } = require('./telemetryStream');
const { compileRule, CompilationError } = require('../compiler/ruleCompiler');

// ── Step 1 & Step 7: In-Memory Runtime Rule Registry ──────────────────────────

/**
 * Registry mapping: Rule ID (string) → RxJS Subscription
 * @type {Map<string, import('rxjs').Subscription>}
 */
const activeRuleSubscriptions = new Map();

/**
 * Metadata store mapping: Rule ID (string) → Rule Metadata / Pipeline details
 * @type {Map<string, { ruleName: string, sensorId?: string, subscribedAt: Date, pipeline?: Object }>}
 */
const activeRuleMetadata = new Map();

// ── Step 4: Duplicate Subscription Check Helper ──────────────────────────────

/**
 * Check if a rule is currently subscribed and active.
 *
 * @param {string} ruleId - Unique rule identifier
 * @returns {boolean} true if subscribed and open, false otherwise
 */
function isRuleSubscribed(ruleId) {
  if (!ruleId) return false;
  const idStr = String(ruleId);
  const sub = activeRuleSubscriptions.get(idStr);
  if (!sub) return false;
  // If subscription was externally closed, clean up and return false
  if (sub.closed) {
    activeRuleSubscriptions.delete(idStr);
    activeRuleMetadata.delete(idStr);
    return false;
  }
  return true;
}

// ── Step 2 & Step 8: Rule Subscription ───────────────────────────────────────

/**
 * Subscribes a compiled rule pipeline to the shared live telemetry$ stream.
 *
 * Flow (Step 2 & 8):
 *   Compiled Rule (Member 2)
 *           ↓
 *    subscribeRule() (Member 1)
 *           ↓
 *       telemetry$
 *           ↓
 *   Rule receives live telemetry
 *
 * Prevents duplicate subscriptions (Step 4):
 *   If ruleId is already subscribed, does NOT create a duplicate subscription.
 *
 * @param {string} ruleId - Unique rule identifier (e.g. 'rule-101')
 * @param {Object|Function} pipeline - Compiled pipeline from compileRule() or RxJS operator
 * @param {Function} [onMatch] - Callback invoked when rule condition matches
 * @param {Function} [onError] - Optional error handler
 * @returns {{ success: boolean, subscription?: import('rxjs').Subscription, reason?: string }}
 */
function subscribeRule(ruleId, pipeline, onMatch, onError) {
  if (!ruleId) {
    console.warn('[RuleStreamManager] Cannot subscribe rule without valid ruleId');
    return { success: false, reason: 'MISSING_RULE_ID' };
  }

  const idStr = String(ruleId);

  // Step 4: Prevent duplicate subscriptions
  if (isRuleSubscribed(idStr)) {
    console.warn(
      `[RuleStreamManager] ⚠️  Rule "${idStr}" is already subscribed. Preventing duplicate subscription.`
    );
    return {
      success: false,
      reason: 'ALREADY_SUBSCRIBED',
      subscription: activeRuleSubscriptions.get(idStr),
    };
  }

  if (!pipeline) {
    console.warn(`[RuleStreamManager] Cannot subscribe rule "${idStr}": pipeline is missing`);
    return { success: false, reason: 'MISSING_PIPELINE' };
  }

  let subscription;

  try {
    // Connect Member 2 compiled pipeline to Member 1 telemetry$
    if (typeof pipeline.run === 'function') {
      subscription = pipeline.run(telemetry$, onMatch, onError);
    } else if (typeof pipeline === 'function') {
      // Pipeable operator function
      subscription = telemetry$.pipe(pipeline).subscribe({
        next: (data) => {
          if (typeof onMatch === 'function') onMatch(data);
        },
        error: (err) => {
          console.error(`[RuleStreamManager] Error in rule "${idStr}" pipeline:`, err.message || err);
          if (typeof onError === 'function') onError(err);
        },
      });
    } else if (typeof pipeline.subscribe === 'function') {
      // Observable
      subscription = pipeline.subscribe({
        next: (data) => {
          if (typeof onMatch === 'function') onMatch(data);
        },
        error: (err) => {
          console.error(`[RuleStreamManager] Error in rule "${idStr}" stream:`, err.message || err);
          if (typeof onError === 'function') onError(err);
        },
      });
    } else {
      throw new TypeError(`Unsupported pipeline type for rule "${idStr}"`);
    }
  } catch (err) {
    console.error(`[RuleStreamManager] Failed to wire subscription for rule "${idStr}":`, err.message);
    return { success: false, reason: 'SUBSCRIPTION_ERROR', error: err.message };
  }

  // Register in runtime registry (Step 7)
  activeRuleSubscriptions.set(idStr, subscription);
  activeRuleMetadata.set(idStr, {
    ruleName: pipeline.ruleName || idStr,
    sensorId: pipeline.sensorId,
    subscribedAt: new Date(),
    pipeline,
  });

  console.log(`[RuleStreamManager] ▶️  Rule subscribed successfully: "${idStr}" (Active: ${activeRuleSubscriptions.size})`);

  return {
    success: true,
    ruleId: idStr,
    subscription,
  };
}

// ── Step 3: Rule Unsubscription ──────────────────────────────────────────────

/**
 * Unsubscribes a running rule from the telemetry stream.
 *
 * Flow (Step 3):
 *   Rule Disabled
 *         ↓
 *   unsubscribeRule(ruleId)
 *         ↓
 *   subscription.unsubscribe()
 *         ↓
 *   Removed from activeRuleSubscriptions
 *
 * @param {string} ruleId - Identifier of rule to unsubscribe
 * @returns {boolean} true if rule was found and unsubscribed, false otherwise
 */
function unsubscribeRule(ruleId) {
  if (!ruleId) return false;
  const idStr = String(ruleId);

  const subscription = activeRuleSubscriptions.get(idStr);
  if (!subscription) {
    return false;
  }

  try {
    if (typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
    }
  } catch (err) {
    console.error(`[RuleStreamManager] Error unsubscribing rule "${idStr}":`, err.message);
  } finally {
    activeRuleSubscriptions.delete(idStr);
    activeRuleMetadata.delete(idStr);
  }

  console.log(`[RuleStreamManager] ⏹️  Rule unsubscribed: "${idStr}" (Active: ${activeRuleSubscriptions.size})`);
  return true;
}

// ── Step 5: Active Rule Lifecycle Management ─────────────────────────────────

/**
 * Handles the complete enable/disable lifecycle for a rule document.
 * Connects Member 1's stream manager with Member 2's Rule Engine.
 *
 * Lifecycle flow (Step 5):
 *   Rule Created / Enabled (isActive === true)
 *         ↓
 *   Compile / Subscribe
 *
 *   Rule Disabled (isActive === false)
 *         ↓
 *   Unsubscribe
 *
 * @param {Object} rule - Rule document ({ _id / id, name, isActive, nodes, edges })
 * @param {Function} [onMatch] - Callback for rule triggers
 * @param {Function} [onError] - Callback for errors
 * @returns {{ status: 'subscribed'|'unsubscribed'|'already_subscribed'|'failed'|'skipped', ruleId: string, error?: string }}
 */
function handleRuleLifecycle(rule, onMatch, onError) {
  if (!rule) {
    return { status: 'failed', ruleId: 'unknown', error: 'Rule object is missing' };
  }

  const ruleId = rule._id ? String(rule._id) : rule.id || 'unknown';
  const ruleName = rule.name || 'Unnamed Rule';
  const isActive = Boolean(rule.isActive);

  if (!isActive) {
    // Rule is disabled: unsubscribe if currently active
    const wasSubscribed = isRuleSubscribed(ruleId);
    if (wasSubscribed) {
      unsubscribeRule(ruleId);
      return { status: 'unsubscribed', ruleId };
    }
    return { status: 'skipped', ruleId };
  }

  // Rule is active: check if already subscribed (Step 4)
  if (isRuleSubscribed(ruleId)) {
    return { status: 'already_subscribed', ruleId };
  }

  // Compile with Member 2 compiler (Step 8)
  let compiledPipeline;
  try {
    compiledPipeline = compileRule(rule);
  } catch (err) {
    console.error(`[RuleStreamManager] Compilation failed for rule "${ruleName}" (${ruleId}):`, err.message);
    return { status: 'failed', ruleId, error: err.message };
  }

  // Subscribe to telemetry$
  const result = subscribeRule(ruleId, compiledPipeline, onMatch, onError);
  if (result.success) {
    return { status: 'subscribed', ruleId };
  }

  return { status: 'failed', ruleId, error: result.reason };
}

/**
 * Re-subscribes a rule after modifications (unsubscribes old, compiles new, subscribes).
 *
 * @param {Object} rule - Updated rule document
 * @param {Function} [onMatch] - Trigger callback
 * @returns {boolean} true if successfully restarted
 */
function restartRuleSubscription(rule, onMatch, onError) {
  if (!rule) return false;
  const ruleId = rule._id ? String(rule._id) : rule.id || 'unknown';

  // Unsubscribe existing if present
  if (isRuleSubscribed(ruleId)) {
    unsubscribeRule(ruleId);
  }

  const res = handleRuleLifecycle(rule, onMatch, onError);
  return res.status === 'subscribed';
}

// ── Step 7 & Diagnostics: Registry Status ────────────────────────────────────

/**
 * Returns diagnostic details of all active rule subscriptions.
 *
 * @returns {Array<{ ruleId: string, ruleName: string, subscribedAt: Date, closed: boolean }>}
 */
function getActiveSubscriptionStatus() {
  const statusList = [];
  for (const [ruleId, subscription] of activeRuleSubscriptions.entries()) {
    const meta = activeRuleMetadata.get(ruleId) || {};
    statusList.push({
      ruleId,
      ruleName: meta.ruleName || ruleId,
      subscribedAt: meta.subscribedAt,
      closed: Boolean(subscription.closed),
    });
  }
  return statusList;
}

/**
 * Gets array of currently active rule IDs.
 * @returns {string[]}
 */
function getActiveRuleIds() {
  return Array.from(activeRuleSubscriptions.keys());
}

/**
 * Gets current count of active rule subscriptions.
 * @returns {number}
 */
function getActiveSubscriptionCount() {
  return activeRuleSubscriptions.size;
}

// ── Step 9: Server Shutdown & Cleanup ─────────────────────────────────────────

/**
 * Cleans up all active subscriptions and stream resources on server shutdown.
 * Prevents dangling subscriptions and memory leaks.
 *
 * Flow (Step 9):
 *   Server Shutdown
 *         ↓
 *   Unsubscribe Rules
 *         ↓
 *   Close Stream Resources
 *
 * @returns {{ unsubscribedCount: number }}
 */
function cleanupOnShutdown() {
  const count = activeRuleSubscriptions.size;
  console.log(`[RuleStreamManager] 🛑 Server shutdown initiated. Cleaning up ${count} active rule subscription(s)...`);

  for (const [ruleId, subscription] of activeRuleSubscriptions.entries()) {
    try {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    } catch (err) {
      console.error(`[RuleStreamManager] Error unsubscribing rule "${ruleId}" on shutdown:`, err.message);
    }
  }

  activeRuleSubscriptions.clear();
  activeRuleMetadata.clear();

  console.log(`[RuleStreamManager] ✅ Cleanup complete. All rule subscriptions terminated.`);
  return { unsubscribedCount: count };
}

// ── Module Exports ───────────────────────────────────────────────────────────

module.exports = {
  // Step 1 & 7: Runtime Registry
  activeRuleSubscriptions,
  activeRuleMetadata,
  isRuleSubscribed,

  // Step 2 & 8: Subscription
  subscribeRule,

  // Step 3: Unsubscription
  unsubscribeRule,

  // Step 5: Active Rule Lifecycle
  handleRuleLifecycle,
  restartRuleSubscription,

  // Diagnostics & Queries
  getActiveSubscriptionStatus,
  getActiveRuleIds,
  getActiveSubscriptionCount,

  // Step 9: Shutdown Cleanup
  cleanupOnShutdown,
  unsubscribeAll: cleanupOnShutdown,

  // Stream Bridge (Member 1 Stream Source)
  telemetry$,
  pushTelemetry,
};
