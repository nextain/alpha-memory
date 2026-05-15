# Cognitive Memory: Gold Standard & Technical Plan

**Date**: 2026-05-15
**Goal**: Elevate Naia-Memory from a 'Fact' repository to a true 'Cognitive Experience' system, setting a standard recognized by the wider AI ecosystem.

## 1. Technical Implementation Plan (Revised via Peer Review)

### A. Non-linear Gating Mechanism (vs. Linear Weighting)
Instead of a rigid `(Vector * 0.5) + (Recency * 0.2) + (Emotion * 0.3)` formula, we implement **Non-linear Gating**.
*   **Mechanism**: High emotional significance triggers a "Flashbulb Memory" bypass, allowing immediate recall regardless of recency or low baseline vector similarity.

### B. Epoch-based Anchoring (vs. Absolute Dates)
Moving beyond converting "yesterday" to `YYYY-MM-DD`.
*   **Mechanism**: The system groups memories into 'Epochs' (e.g., "before the move", "during the internship"). This mirrors human episodic organization, allowing queries like "how did my habits change after I moved?".

### C. Semantic Consolidation (The Power of Forgetting)
A system is not intelligent if it simply logs everything. It must know how to forget.
*   **Mechanism**: The system autonomously "distills" raw episodic logs into high-level semantic insights (e.g., "The user tends to prioritize speed over safety when stressed"). It prunes redundant or low-value data (Ebbinghaus decay), moving from 'data storage' to 'insight acquisition'.

## 2. Benchmark "Gold Standard" Thresholds

To be recognized by other AIs (and experts) as a state-of-the-art cognitive memory system, Naia-Memory must pass these rigorous thresholds on the new dynamic benchmarks:

| Metric | Target Threshold | Description |
| :--- | :---: | :--- |
| **Spike Timing FP Rate** | **< 3%** | False Positive rate for Proactive recalls. The AI must intervene contextually, not just randomly spam past memories. |
| **Temporal Recall Precision** | **> 98%** | Accuracy in retrieving the correct facts across non-linear time queries ("what did I think about X before Y happened?"). |
| **Belief Consistency Index** | **> 90%** | The ability to correctly track the evolution of a user's values (Value Evolution) while applying the *current* state's reasoning to new problems. |
| **Analogy Utility Score** | **4.5 / 5.0** | (Expert/LLM-as-a-Judge rated). Effectiveness of Cross-domain Analogies (e.g., applying lessons from a cooking hobby to a coding problem). |
| **Latent Association Speed** | **< 500ms** | End-to-end latency for memory integration, ensuring the "Active Brain" remains responsive in real-time dialog. |
