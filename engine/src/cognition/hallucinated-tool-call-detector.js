/**
 * hallucinated-tool-call-detector.js
 *
 * Jerry's 2026-04-17 self-diagnosis found agents writing literal
 * [TOOL_CALL: query_brain] text in their thought output — hallucinating
 * tool calls instead of actually invoking tools. When detected and no
 * real action tag accompanies it, the thought is noise: the agent
 * THINKS it's doing something, but the text is inert. This detector
 * lets the caller discard such thoughts before they pollute the
 * journal.
 */

// Match bare [TOOL_CALL: name] or [tool_call: name] variants.
const TOOL_CALL_PATTERN = /\[\s*(?:TOOL[_\s]*CALL|tool[_\s]*call|TOOL|tool)\s*:\s*[a-zA-Z_][\w-]*\s*[\]\s]/;

// Count occurrences — useful for "how hallucinogenic is this output?"
function countHallucinatedToolCalls(text) {
  if (!text || typeof text !== 'string') return 0;
  const re = /\[\s*(?:TOOL[_\s]*CALL|tool[_\s]*call|TOOL|tool)\s*:\s*[a-zA-Z_][\w-]*\s*[\]\s]/g;
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function hasHallucinatedToolCall(text) {
  return countHallucinatedToolCalls(text) > 0;
}

module.exports = {
  countHallucinatedToolCalls,
  hasHallucinatedToolCall,
  TOOL_CALL_PATTERN,
};
