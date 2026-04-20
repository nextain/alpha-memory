# A/B Testing Guide for Backend Algorithms

This document outlines how to set up and analyze A/B tests for different memory algorithms or backend logic variations within the `alpha-memory` project.

## 1. Overview

The A/B testing framework allows for running experiments to compare the performance of different implementations of a memory algorithm. Traffic is split between a 'control' variant and one or more 'treatment' variants. Metrics are collected to determine which variant performs best.

## 2. Implementation Details

### API Server (`api-server`)

The `api-server` is responsible for:
*   **Experiment Configuration**: Defining active experiments, their variants, and traffic distribution. This is currently hardcoded in `api-server/utils/experiment_manager.py` but can be moved to a more dynamic system (e.g., database, feature flag service).
*   **Variant Assignment**: Assigning incoming requests (based on `X-User-Id` header) to a specific experiment variant using a consistent hashing mechanism.
*   **Integration**: Passing the assigned variant to the `memory_system` (TypeScript) via API calls.

**Key Files:**
*   `api-server/utils/experiment_manager.py`: Contains the `AB_TEST_CONFIG` and the `get_variant` function for assigning variants.
*   `api-server/main.py`: The `/search` endpoint demonstrates how to retrieve the user's variant and pass it to the underlying `memory_service`.

### Memory System (`src/memory`)

The `src/memory` module is responsible for:
*   **Algorithm Interface**: Defining a common interface (`MemoryAlgorithm`) that all variants must adhere to.
*   **Algorithm Implementations**: Providing concrete implementations for each variant (e.g., `AlgorithmVariantA` for 'control', `AlgorithmVariantB` for 'treatment').
*   **Dynamic Loading**: Instantiating the correct algorithm variant based on the variant name provided by the `api-server`.
*   **Event Logging**: Logging key metrics (e.g., duration, results count) for each variant during a search operation.

**Key Files:**
*   `src/memory/algorithms/base.ts`: Defines the `MemoryAlgorithm` interface.
*   `src/memory/algorithms/variantA.ts`: Example implementation of the 'control' algorithm.
*   `src/memory/algorithms/variantB.ts`: Example implementation of a 'treatment' algorithm.
*   `src/memory/index.ts`: Contains the `getMemoryAlgorithm` factory function and the `search` method within the `MemorySystem` class, which orchestrates the A/B test.

## 3. How to Run an A/B Test

1.  **Define Variants**:
    *   Create new algorithm implementations in `src/memory/algorithms/` that implement the `MemoryAlgorithm` interface (if you need more than A and B).
    *   Update `src/memory/index.ts`'s `getMemoryAlgorithm` function to include new variants.
2.  **Configure Experiment**:
    *   Modify the `AB_TEST_CONFIG` dictionary in `api-server/utils/experiment_manager.py`.
    *   Set `enabled: True` for your experiment.
    *   Adjust `weights` for each `variant` to control traffic distribution (e.g., `{"control": {"weight": 0.5}, "treatment": {"weight": 0.5}}` for a 50/50 split).
    *   Define a `default_variant` for when the experiment is disabled or a variant is not found.
3.  **Start Services**:
    *   Ensure both the `api-server` (Python) and the `alpha-memory` (TypeScript, built) services are running.
4.  **Send Requests**:
    *   Send requests to the `/search` endpoint of the `api-server`, including an `X-User-Id` header. This ID will be used for consistent variant assignment.
    *   Example: `curl -H "X-User-Id: user123" "http://localhost:8000/search?query=test"`
5.  **Monitor Logs**:
    *   Observe the console logs from both the `api-server` and the `alpha-memory` service.
    *   Logs from `src/memory/index.ts` will show which variant was used, the query, results count, and duration.
    *   Example log: `Experiment: memory_algorithm_experiment, Variant: control, Query: "test", Results Count: 1, Duration: 100.50ms`

## 4. Data Analysis

Currently, A/B test metrics are logged to the console. For proper analysis:
*   **Integrate with a Logging System**: Redirect `console.log` output to a structured logging system (e.g., ELK stack, Datadog) for easier aggregation and querying.
*   **Database Integration**: Extend the `api-server`'s database schema (`api-server/models.py`, `api-server/create_db.py`) to store A/B test events (user ID, experiment, variant, timestamp, metrics).
*   **Statistical Analysis**: Use statistical tools (e.g., Python with SciPy/Pandas, R) to analyze collected data, perform significance tests, and determine the winning variant. Key metrics to compare include:
    *   Average response time
    *   Number of results
    *   Relevance scores (if applicable)

## 5. Cleaning Up an Experiment

Once an A/B test concludes:
1.  **Disable Experiment**: Set `enabled: False` for the experiment in `api-server/utils/experiment_manager.py`.
2.  **Remove Old Code**: Refactor the winning variant into the main codebase and remove the other variants and experiment-specific code. This ensures the codebase remains clean and maintainable.

This guide provides a basic framework for A/B testing. For advanced use cases, consider dedicated feature flagging and A/B testing platforms.
